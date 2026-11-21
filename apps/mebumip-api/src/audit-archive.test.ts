import test from "node:test";
import assert from "node:assert/strict";
import { createChainedAuditEvent } from "./security.js";
import { archiveAuditPackage, buildAuditArchivePackage, type ImmutableAuditArchiveSink } from "./audit-archive.js";
import type { Db } from "mongodb";

process.env.AUDIT_SIGNING_KEY = "test-audit-signing-key-with-adequate-entropy";

function event(sequence:number, previousHash = sequence === 1 ? "GENESIS" : "a".repeat(64)) {
  return createChainedAuditEvent({actorUserId:"archive-test",action:"archive.test",targetType:"test",outcome:"success",correlationId:"archive-"+sequence},sequence,previousHash);
}
function contiguousEvents() {
  const first=event(1);
  const second=event(2,first.eventHash);
  return [first,second];
}

test("audit archive package is contiguous, signed, and content addressed",()=>{
  const [first,second]=contiguousEvents();
  const archive=buildAuditArchivePackage([second,first],1,2,new Date("2026-11-20T00:00:00.000Z"));
  assert.equal(archive.eventCount,2);
  assert.equal(archive.fromSequence,1);
  assert.equal(archive.toSequence,2);
  assert.match(archive.objectKey,new RegExp(archive.sha256));
  const body=JSON.parse(archive.content.toString("utf8"));
  assert.equal(body.archiveFormat,"zuri-mebumip-immutable-audit-archive-v1");
  assert.equal(body.manifest.integrity.algorithm,"HMAC-SHA256");
});

test("audit archive package rejects gaps, invalid signatures, oversized batches, and unsigned manifests",()=>{
  assert.throws(()=>buildAuditArchivePackage([event(1),event(3)],1,2),/AUDIT_ARCHIVE_SEQUENCE_GAP|AUDIT_ARCHIVE_BATCH_SIZE_OR_GAP_INVALID/);
  const tampered={...event(1),action:"tampered"};
  assert.throws(()=>buildAuditArchivePackage([tampered],1,1),/AUDIT_ARCHIVE_EVENT_SIGNATURE_INVALID/);
  assert.throws(()=>buildAuditArchivePackage(Array.from({length:1001},(_,i)=>event(i+1)),1,1001),/AUDIT_ARCHIVE_BATCH_SIZE_OR_GAP_INVALID/);
  const old=process.env.AUDIT_SIGNING_KEY;
  delete process.env.AUDIT_SIGNING_KEY;
  assert.throws(()=>buildAuditArchivePackage([event(1)],1,1),/AUDIT_ARCHIVE_EVENT_SIGNATURE_INVALID|AUDIT_ARCHIVE_MANIFEST_UNSIGNED/);
  process.env.AUDIT_SIGNING_KEY=old;
});

test("archive receipt is persisted only after sink confirms immutable retention",async()=>{
  const archive=buildAuditArchivePackage([event(10)],10,10);
  const retention={retainUntil:new Date(Date.now()+365*24*60*60*1000),legalHold:true,preventOverwrite:true as const,preventDeleteUntilRetention:true as const,preventAdministrativeBypass:true};
  let saved:Record<string,unknown>|undefined;
  const fakeDb={collection:()=>({
    findOne:async()=>null,
    updateOne:async(_filter:unknown,update:{$setOnInsert:Record<string,unknown>})=>{saved=update.$setOnInsert;return {upsertedCount:1};}
  })} as unknown as Db;
  const sink:ImmutableAuditArchiveSink={
    putImmutableObject:async input=>({objectKey:input.objectKey,versionId:"version-123",sha256:input.sha256,retainUntil:input.retention.retainUntil,legalHold:true,preventOverwrite:true,preventDeleteUntilRetention:true,preventAdministrativeBypass:true})
  };
  const receipt=await archiveAuditPackage(fakeDb,sink,archive,retention);
  assert.equal(receipt.versionId,"version-123");
  assert.equal(receipt.legalHold,true);
  assert.equal(saved?.objectKey,archive.objectKey);
  const badSink:ImmutableAuditArchiveSink={
    putImmutableObject:async input=>({objectKey:input.objectKey,versionId:"version-456",sha256:input.sha256,retainUntil:input.retention.retainUntil,legalHold:false,preventOverwrite:true,preventDeleteUntilRetention:true,preventAdministrativeBypass:false})
  };
  await assert.rejects(()=>archiveAuditPackage(fakeDb,badSink,archive,retention),/AUDIT_ARCHIVE_STORAGE_RETENTION_NOT_CONFIRMED/);
});
