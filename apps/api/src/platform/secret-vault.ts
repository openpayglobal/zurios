import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { AssumeRoleWithWebIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { DecryptCommand, GenerateDataKeyCommand, KMSClient } from "@aws-sdk/client-kms";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getVercelOidcToken } from "@vercel/oidc";

const TEAM_SLUG = "openpayglobal-5300s-projects";
const TEAM_ID = "team_Gn7gvUwfzUbCZpxOIRrYK5gD";
const MAC_API_PROJECT_ID = "prj_vkIcPCsN1TW3WOturczl3FcWEJkq";
const ISSUER = `https://oidc.vercel.com/${TEAM_SLUG}`;
const AUDIENCE = `https://vercel.com/${TEAM_SLUG}`;
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));

export type MacSecretContext = { secretId: string; version: number };
export type MacSecretEnvelope = {
  algorithm: "AES-256-GCM";
  kmsKeyArn: string;
  encryptedDataKey: string;
  iv: string;
  authTag: string;
  ciphertext: string;
};

export function isMacSecretVaultConfigured(): boolean {
  return Boolean(process.env.AWS_REGION && process.env.AWS_ROLE_ARN && process.env.MAC_SECRETS_KMS_KEY_ARN);
}

function aad(context: MacSecretContext): Buffer {
  return Buffer.from(JSON.stringify({ application: "zuri-os-mac", purpose: "mac-secret", secretId: context.secretId, version: context.version }), "utf8");
}

export function sealSecretWithDataKey(
  value: string,
  dataKey: Uint8Array,
  encryptedDataKey: Uint8Array,
  kmsKeyArn: string,
  context: MacSecretContext,
): MacSecretEnvelope {
  if (dataKey.byteLength !== 32) throw new Error("MAC_SECRET_DATA_KEY_INVALID");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(dataKey), iv);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    algorithm: "AES-256-GCM",
    kmsKeyArn,
    encryptedDataKey: Buffer.from(encryptedDataKey).toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function openSecretWithDataKey(
  envelope: MacSecretEnvelope,
  dataKey: Uint8Array,
  context: MacSecretContext,
): string {
  if (envelope.algorithm !== "AES-256-GCM" || dataKey.byteLength !== 32) throw new Error("MAC_SECRET_ENVELOPE_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(dataKey), Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(aad(context));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function createMacKmsClient(): Promise<KMSClient> {
  if (process.env.VERCEL_ENV !== "production") throw new Error("MAC_SECRET_VAULT_PRODUCTION_ONLY");
  const region = process.env.AWS_REGION;
  const roleArn = process.env.AWS_ROLE_ARN;
  const keyArn = process.env.MAC_SECRETS_KMS_KEY_ARN;
  if (!region || !roleArn || !keyArn) throw new Error("MAC_SECRET_VAULT_NOT_CONFIGURED");
  const oidcToken = await getVercelOidcToken();
  if (!oidcToken) throw new Error("MAC_SECRET_VAULT_OIDC_REQUIRED");

  const { payload } = await jwtVerify(oidcToken, jwks, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ["RS256"],
  });
  if (
    payload.owner_id !== TEAM_ID ||
    payload.project_id !== MAC_API_PROJECT_ID ||
    payload.environment !== "production" ||
    payload.sub !== `owner:${TEAM_SLUG}:project:zurios-api:environment:production`
  ) throw new Error("MAC_SECRET_VAULT_WORKLOAD_NOT_AUTHORIZED");

  const sts = new STSClient({ region });
  let assumed;
  try {
    assumed = await sts.send(new AssumeRoleWithWebIdentityCommand({
      RoleArn: roleArn,
      RoleSessionName: "zuri-mac-secrets",
      WebIdentityToken: oidcToken,
      DurationSeconds: 900,
    }));
  } finally {
    sts.destroy();
  }
  const credentials = assumed.Credentials;
  if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
    throw new Error("MAC_SECRET_VAULT_AWS_CREDENTIALS_UNAVAILABLE");
  }
  return new KMSClient({
    region,
    credentials: {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    },
  });
}

export async function encryptMacSecret(
  value: string,
  context: MacSecretContext,
 ): Promise<MacSecretEnvelope> {
  const keyArn = process.env.MAC_SECRETS_KMS_KEY_ARN;
  if (!keyArn) throw new Error("MAC_SECRET_VAULT_NOT_CONFIGURED");
  const kms = await createMacKmsClient();
  try {
    const generated = await kms.send(new GenerateDataKeyCommand({
      KeyId: keyArn,
      KeySpec: "AES_256",
      EncryptionContext: {
        application: "zuri-os-mac",
        purpose: "mac-secret",
        secretId: context.secretId,
        version: String(context.version),
      },
    }));
    if (!generated.Plaintext || !generated.CiphertextBlob) throw new Error("MAC_SECRET_DATA_KEY_GENERATION_FAILED");
    const dataKey = Buffer.from(generated.Plaintext);
    try {
      return sealSecretWithDataKey(value, dataKey, generated.CiphertextBlob, keyArn, context);
    } finally {
      dataKey.fill(0);
      generated.Plaintext.fill(0);
    }
  } finally {
    kms.destroy();
  }
}

async function decryptWithKmsClient(
  kms: KMSClient,
  envelope: MacSecretEnvelope,
  context: MacSecretContext,
): Promise<string> {
  const unwrapped = await kms.send(new DecryptCommand({
    KeyId: envelope.kmsKeyArn,
    CiphertextBlob: Buffer.from(envelope.encryptedDataKey, "base64"),
    EncryptionContext: {
      application: "zuri-os-mac",
      purpose: "mac-secret",
      secretId: context.secretId,
      version: String(context.version),
    },
  }));
  if (!unwrapped.Plaintext) throw new Error("MAC_SECRET_DATA_KEY_DECRYPTION_FAILED");
  const dataKey = Buffer.from(unwrapped.Plaintext);
  try {
    return openSecretWithDataKey(envelope, dataKey, context);
  } finally {
    dataKey.fill(0);
    unwrapped.Plaintext.fill(0);
  }
}

export async function decryptMacSecret(
  envelope: MacSecretEnvelope,
  context: MacSecretContext,
 ): Promise<string> {
  const kms = await createMacKmsClient(oidcToken);
  try {
    return await decryptWithKmsClient(kms, envelope, context);
  } finally {
    kms.destroy();
  }
}

/** Decrypt a workload's authorized secrets with one short-lived AWS role session per request. */
export async function decryptMacSecrets(
  records: Array<{ secretId: string; version: number; envelope: MacSecretEnvelope }>,
 ): Promise<Array<{ secretId: string; version: number; value: string }>> {
  if (!records.length) return [];
  const kms = await createMacKmsClient(oidcToken);
  try {
    const settled = await Promise.allSettled(records.map(async record => ({
      secretId: record.secretId,
      version: record.version,
      value: await decryptWithKmsClient(kms, record.envelope, {
        secretId: record.secretId,
        version: record.version,
      }),
    })));
    const failed = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failed) throw new Error("MAC_SECRET_DECRYPTION_FAILED");
    return settled.map(result => (result as PromiseFulfilledResult<{secretId:string;version:number;value:string}>).value);
  } finally {
    kms.destroy();
  }
}


/** Read and decrypt only active secret versions explicitly scoped to one Production service. */
export async function readMacSecretsForService(
  db: Db,
  service: "zurios-api" | "zuri-mebumip-api",
  secretIds?: string[],
): Promise<Array<{secretId:string;version:number;value:string}>> {
  const records = await db.collection<{
    secretId:string;
    version:number;
    allowedServices:string[];
    environment:string;
    envelope:MacSecretEnvelope;
  }>("mac_secrets").find({
    environment:"production",
    allowedServices:service,
    revokedAt:{$exists:false},
    ...(secretIds?.length?{secretId:{$in:secretIds}}:{}),
  },{projection:{_id:0,secretId:1,version:1,envelope:1}}).toArray();
  return decryptMacSecrets(records);
}
