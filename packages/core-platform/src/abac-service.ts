import type {Db} from "mongodb";
import {coreCollections} from "./repositories.js";
export type PolicyContext={subject:Record<string,unknown>;resource:Record<string,unknown>;action:string;environment?:Record<string,unknown>};
export type PolicyDecision={allowed:boolean;reason:"EXPLICIT_DENY"|"POLICY_ALLOW"|"NO_MATCHING_ALLOW";matchedPolicyIds:string[]};
function matches(expected:Record<string,unknown>,actual:Record<string,unknown>):boolean{return Object.entries(expected).every(([key,value])=>Object.hasOwn(actual,key)&&actual[key]===value);}
/** Equality-only, deny-overrides evaluator. Unsupported operators are never interpreted as allow. */
export function evaluatePolicyDocuments(policies:Array<{policyId:string;effect:"allow"|"deny";priority:number;subject:Record<string,unknown>;resource:Record<string,unknown>;conditions:Record<string,unknown>;actions:string[]}>,context:PolicyContext):PolicyDecision{
 const matching=policies.filter(p=>p.actions.includes(context.action)&&matches(p.subject,context.subject)&&matches(p.resource,context.resource)&&matches(p.conditions,context.environment??{}));
 const denied=matching.filter(p=>p.effect==="deny");
 if(denied.length)return {allowed:false,reason:"EXPLICIT_DENY",matchedPolicyIds:denied.map(p=>p.policyId)};
 const allowed=matching.some(p=>p.effect==="allow");
 return {allowed,reason:allowed?"POLICY_ALLOW":"NO_MATCHING_ALLOW",matchedPolicyIds:matching.map(p=>p.policyId)};
}
export async function evaluatePolicy(db:Db,tenantId:string,context:PolicyContext):Promise<PolicyDecision>{
 const policies=await coreCollections(db).policies.find({tenantId,status:"active",actions:context.action}).sort({priority:-1}).toArray();
 return evaluatePolicyDocuments(policies,context);
}
