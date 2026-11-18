import test from "node:test";
import assert from "node:assert/strict";
import {scoped} from "./repositories.js";
test("tenant scope is always conjoined with caller filter",()=>{
 assert.deepEqual(scoped("tenant-a",{status:"active"}),{$and:[{tenantId:"tenant-a"},{status:"active"}]});
});
