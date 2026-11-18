import test from "node:test";
import assert from "node:assert/strict";
import {evaluatePolicy} from "./abac-service.js";
test("policy matching uses deny-overrides and defaults to deny",async()=>{
 const fakeDb={collection:()=>({find:()=>({sort:()=>({toArray:async()=>[
  {policyId:"allow",effect:"allow",priority:1,subject:{department:"sales"},resource:{classification:"public"},actions:["read"]},
  {policyId:"deny",effect:"deny",priority:2,subject:{department:"sales"},resource:{classification:"public"},actions:["read"]}
 ]})})})};
 const result=await evaluatePolicy(fakeDb as never,"t1",{subject:{department:"sales"},resource:{classification:"public"},action:"read"});
 assert.equal(result.allowed,false);assert.equal(result.reason,"EXPLICIT_DENY");
});
