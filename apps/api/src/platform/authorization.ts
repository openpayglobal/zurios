import type {PlatformPrincipal} from "./types.js";
export type AccessRequest={permission:string;resourceTenantId:string;organizationId?:string;locationId?:string;resourceAttributes?:Record<string,unknown>};
export function authorize(p:PlatformPrincipal,r:AccessRequest):boolean{
 if(p.tenantId!==r.resourceTenantId)return false;
 if(!p.permissions.includes(r.permission))return false;
 if(r.organizationId){
  const allowed=p.organizationIds??(p.organizationId?[p.organizationId]:[]);
  if(!allowed.includes(r.organizationId))return false;
 }
 if(r.locationId&&!p.locationIds.includes(r.locationId))return false;
 for(const [key,value] of Object.entries(r.resourceAttributes??{})){
  if(key.startsWith("requiredSubject.")&&p.attributes[key.slice("requiredSubject.".length)]!==value)return false;
 }
 return true;
}
