import test from "node:test";
import assert from "node:assert/strict";
import {authorizeDomainResource,assertDomainResourceScope} from "./domain-authorization.js";
import type {PlatformPrincipal} from "./types.js";
const principal:PlatformPrincipal={
 userId:"user-1",tenantId:"tenant-1",organizationIds:["org-1","org-2"],
 organizationId:"org-1",locationIds:["loc-1"],roleKeys:["manager"],
 permissions:["inventory.read","inventory.write"],attributes:{}
};
test("domain resource authorization requires an explicit resource scope",()=>{
 assert.equal(authorizeDomainResource(principal,"inventory.read",{tenantId:"tenant-1"}),false);
});
test("domain resource authorization rejects a different tenant",()=>{
 assert.equal(authorizeDomainResource(principal,"inventory.read",{tenantId:"tenant-2",organizationId:"org-1",locationId:"loc-1"}),false);
});
test("domain resource authorization requires the exact permission",()=>{
 assert.equal(authorizeDomainResource(principal,"erp.journal.post",{tenantId:"tenant-1",organizationId:"org-1"}),false);
});
test("domain resource authorization accepts an assigned organization",()=>{
 assert.equal(authorizeDomainResource(principal,"inventory.read",{tenantId:"tenant-1",organizationId:"org-2"}),true);
});
test("domain resource authorization rejects an unassigned organization",()=>{
 assert.equal(authorizeDomainResource(principal,"inventory.read",{tenantId:"tenant-1",organizationId:"org-3"}),false);
});
test("domain resource authorization enforces both organization and location when present",()=>{
 assert.equal(authorizeDomainResource(principal,"inventory.read",{tenantId:"tenant-1",organizationId:"org-1",locationId:"loc-2"}),false);
 assert.equal(authorizeDomainResource(principal,"inventory.read",{tenantId:"tenant-1",organizationId:"org-1",locationId:"loc-1"}),true);
});
test("assertion fails closed with a stable denial code",()=>{
 assert.throws(()=>assertDomainResourceScope(principal,"inventory.read",{tenantId:"tenant-1"}),{message:"DOMAIN_RESOURCE_SCOPE_DENIED"});
});
