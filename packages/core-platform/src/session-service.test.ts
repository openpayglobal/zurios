import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {rotateRefreshToken} from "./session-service.js";
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
function fakeDb(session:any){let revocations=0;const sessions={findOne:async()=>session,updateMany:async()=>{revocations++;return {modifiedCount:1};},updateOne:async()=>({modifiedCount:0})};const active={findOne:async()=>({status:"active"})};return {db:{collection:(name:string)=>name==="sessions"?sessions:active},revocations:()=>revocations};}
const session={tenantId:"t1",sessionId:"s1",userId:"u1",membershipId:"m1",tokenFamilyId:"f1",refreshTokenHash:hash("current"),refreshTokenHistory:[hash("old")],expiresAt:new Date(Date.now()+60_000)};
test("an arbitrary invalid refresh token does not revoke a valid session family",async()=>{const f=fakeDb({...session});await assert.rejects(()=>rotateRefreshToken(f.db as never,"t1","s1","random-guess"),/SESSION_INVALID/);assert.equal(f.revocations(),0);});
test("reuse of a previously consumed refresh token revokes its family",async()=>{const f=fakeDb({...session});await assert.rejects(()=>rotateRefreshToken(f.db as never,"t1","s1","old"),/REFRESH_TOKEN_REUSE_DETECTED/);assert.equal(f.revocations(),1);});
