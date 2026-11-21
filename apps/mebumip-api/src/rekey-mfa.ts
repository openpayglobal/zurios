import { MongoClient } from "mongodb";
import { config } from "./config.js";
import { decryptMfaSecret, encryptMfaSecret, getActiveMfaEncryptionKeyId, getMfaEncryptionKeyId } from "./mfa.js";

const apply = process.env.MFA_REKEY_APPLY === "true";
if (apply && process.env.MFA_REKEY_BACKUP_CONFIRMED !== "true") {
  throw new Error("MFA_REKEY_BACKUP_CONFIRMATION_REQUIRED");
}
if (!config.MONGODB_URI) throw new Error("MONGODB_URI_NOT_CONFIGURED");
const activeKeyId = getActiveMfaEncryptionKeyId();
if (!activeKeyId) throw new Error("MFA_ACTIVE_ENCRYPTION_KEY_NOT_CONFIGURED");

const client = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
const summary = { usersScanned: 0, secretsScanned: 0, alreadyCurrent: 0, legacy: 0, previousKey: 0, migrated: 0, conflicts: 0 };
try {
  await client.connect();
  const db = client.db(config.MONGODB_DATABASE);
  const cursor = db.collection("users").find({
    $or: [
      { mfaSecretEncrypted: { $type: "string" } },
      { mfaPendingSecret: { $type: "string" } },
    ],
  });
  for await (const user of cursor) {
    summary.usersScanned++;
    for (const field of ["mfaSecretEncrypted", "mfaPendingSecret"] as const) {
      const oldCiphertext = user[field];
      if (typeof oldCiphertext !== "string") continue;
      summary.secretsScanned++;
      const oldKeyId = getMfaEncryptionKeyId(oldCiphertext);
      const plaintext = decryptMfaSecret(oldCiphertext);
      if (oldKeyId === activeKeyId) {
        summary.alreadyCurrent++;
        continue;
      }
      if (oldKeyId === "legacy-unversioned") summary.legacy++;
      else summary.previousKey++;
      // Verify the new ciphertext before attempting the conditional write.
      const replacement = encryptMfaSecret(plaintext);
      if (decryptMfaSecret(replacement) !== plaintext || getMfaEncryptionKeyId(replacement) !== activeKeyId) {
        throw new Error("MFA_REKEY_VERIFICATION_FAILED");
      }
      if (!apply) continue;
      const result = await db.collection("users").updateOne(
        { _id: user._id, [field]: oldCiphertext },
        { $set: { [field]: replacement, updatedAt: new Date() } },
      );
      if (result.modifiedCount !== 1) {
        summary.conflicts++;
        throw new Error("MFA_REKEY_CONCURRENT_UPDATE_CONFLICT");
      }
      summary.migrated++;
    }
  }
  process.stdout.write(JSON.stringify({ mode: apply ? "apply" : "dry-run", activeKeyId, ...summary }, null, 2) + "\n");
} finally {
  await client.close();
}
