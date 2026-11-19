import {authorize} from "./authorization.js";
import type {PlatformPrincipal} from "./types.js";

export type DomainResourceScope = {
 tenantId:string;
 organizationId?:string;
 locationId?:string;
};

/**
 * Domain endpoints must authorize against scope loaded from the persisted resource,
 * never against organization/location IDs supplied only by the caller.
 * An unscoped resource is denied by default; callers must explicitly model its
 * organization or location ownership before exposing it through the API.
 */
export function authorizeDomainResource(
 principal:PlatformPrincipal,
 permission:string,
 resource:DomainResourceScope
):boolean{
 if(!resource.organizationId&&!resource.locationId)return false;
 return authorize(principal,{
  permission,
  resourceTenantId:resource.tenantId,
  ...(resource.organizationId?{organizationId:resource.organizationId}:{}),
  ...(resource.locationId?{locationId:resource.locationId}:{})
 });
}

export function assertDomainResourceScope(
 principal:PlatformPrincipal,
 permission:string,
 resource:DomainResourceScope
):void{
 if(!authorizeDomainResource(principal,permission,resource))throw new Error("DOMAIN_RESOURCE_SCOPE_DENIED");
}
