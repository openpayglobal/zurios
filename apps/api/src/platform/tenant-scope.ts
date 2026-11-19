import type {Filter} from "mongodb";
import type {PlatformPrincipal} from "./types.js";

/** Always derive tenant scope from a verified principal, never from request body/query input. */
export function tenantFilter<T extends object>(principal:PlatformPrincipal, extra:Filter<T>={}):Filter<T>{
 return {$and:[{tenantId:principal.tenantId},extra]} as unknown as Filter<T>;
}
export function assertTenantAccess(principal:PlatformPrincipal,resourceTenantId:string):void{
 if(principal.tenantId!==resourceTenantId)throw new Error("TENANT_ACCESS_DENIED");
}
