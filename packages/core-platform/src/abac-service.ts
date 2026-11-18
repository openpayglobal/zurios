import type {Db} from "mongodb";
import {coreCollections} from "./repositories.js";
export type PolicyContext={subject:Record<string,unknown>;resource:Record<string,unknown>;action:string};
function matches(expected:Record<string,unknown>,actual:Record<string,unknown>):boolean{
 return Object.entries(expected).every(([key,value])=>actual[key]===value);
}
/** Deny-overrides policy evaluation. Missing matching allow means deny. */
export async function evaluatePolicy(db:Db,tenantId:string,context:PolicyContext):Promise<{allowed:boolean;reason:string;matchedPolicyIds:string[]}>{
 const policies=await coreCollections(db).policies.find({tenantId,status:"active",actions:context.action}).sort({priority:-1}).toArray();
 const matched=policies.filter(p=>matches(p.subject,context.subject)&&matches(p.resource,context.resource));
 const denied=matched.filter(p=>p.effect==="deny");
 if(denied.length)return {allowed:false,reason:"EXPLICIT_DENY",matchedPolicyIds:denied.map(p=>p.policyId)};
 const allowed=matched.some(p=>p.effect==="allow");
 return {allowed,reason:allowed?"POLICY_ALLOW":"NO_MATCHING_ALLOW",matchedPolicyIds:matched.map(p=>p.policyId)};
}
