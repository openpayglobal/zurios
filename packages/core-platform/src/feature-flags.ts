import type {Db} from "mongodb";
import {coreCollections} from "./repositories.js";
/** Missing, disabled, or environment-mismatched flags always evaluate to false. Rules are equality-only allow refinements. */
export async function isFeatureEnabled(db:Db,tenantId:string,key:string,environment:string,context:Record<string,unknown>={}):Promise<boolean>{
 const flag=await coreCollections(db).featureFlags.findOne({tenantId,key});
 if(!flag||!flag.enabled||!flag.environments.includes(environment))return false;
 if(!flag.rules.length)return true;
 return flag.rules.some(rule=>Object.entries(rule).every(([k,v])=>Object.hasOwn(context,k)&&context[k]===v));
}
