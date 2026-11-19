import test from "node:test";
import assert from "node:assert/strict";
import {authorizePlatformOperator,type PlatformOperatorPrincipal} from "./operator-authorization.js";

const now=new Date("2026-11-19T08:00:00.000Z");
const operator:PlatformOperatorPrincipal={
  operatorId:"operator-1",
  sessionId:"mac-session-1",
  permissions:["mac.overview.read","mac.audit.read"],
  mfaVerifiedAt:new Date("2026-11-19T07:59:00.000Z"),
  tenantIds:["tenant-a"]
};

test("allows an explicitly granted MAC permission after MFA",()=>{
  assert.deepEqual(authorizePlatformOperator(operator,{permission:"mac.overview.read",now}),{allowed:true,source:"standing"});
});

test("denies tenant membership permissions from granting global MAC access",()=>{
  assert.deepEqual(authorizePlatformOperator({...operator,permissions:["platform.organizations.read"]},{permission:"mac.overview.read",now}),{allowed:false,reason:"PERMISSION_DENIED"});
});

test("denies wildcard permissions",()=>{
  assert.deepEqual(authorizePlatformOperator({...operator,permissions:["*"]},{permission:"mac.overview.read",now}),{allowed:false,reason:"PERMISSION_DENIED"});
});

test("denies requests without an MFA verification timestamp",()=>{
  assert.deepEqual(authorizePlatformOperator({...operator,mfaVerifiedAt:undefined as unknown as Date},{permission:"mac.overview.read",now}),{allowed:false,reason:"MFA_REQUIRED"});
});

test("denies tenant-targeted access outside the operator grant",()=>{
  assert.deepEqual(authorizePlatformOperator(operator,{permission:"mac.audit.read",tenantId:"tenant-b",now}),{allowed:false,reason:"TENANT_SCOPE_DENIED"});
});

test("allows an exact permission in a valid approved elevation",()=>{
  const elevated={...operator,permissions:[],elevation:{permissions:["mac.deployments.rollback"],expiresAt:new Date("2026-11-19T08:10:00.000Z"),approvalId:"approval-1"}};
  assert.deepEqual(authorizePlatformOperator(elevated,{permission:"mac.deployments.rollback",now}),{allowed:true,source:"elevation"});
});

test("denies an expired elevation",()=>{
  const elevated={...operator,permissions:[],elevation:{permissions:["mac.deployments.rollback"],expiresAt:new Date("2026-11-19T07:59:59.000Z"),approvalId:"approval-1"}};
  assert.deepEqual(authorizePlatformOperator(elevated,{permission:"mac.deployments.rollback",now}),{allowed:false,reason:"ELEVATION_EXPIRED"});
});

test("denies an elevation without an approval reference",()=>{
  const elevated={...operator,permissions:[],elevation:{permissions:["mac.deployments.rollback"],expiresAt:new Date("2026-11-19T08:10:00.000Z"),approvalId:""}};
  assert.deepEqual(authorizePlatformOperator(elevated,{permission:"mac.deployments.rollback",now}),{allowed:false,reason:"INVALID_PRINCIPAL"});
});

test("denies missing principals",()=>{
  assert.deepEqual(authorizePlatformOperator(null,{permission:"mac.overview.read",now}),{allowed:false,reason:"INVALID_PRINCIPAL"});
});
