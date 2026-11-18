export type PlatformPrincipal={userId:string;tenantId:string;organizationId?:string;organizationIds:string[];locationIds:string[];roleKeys:string[];permissions:string[];attributes:Record<string,unknown>};
export type AuditActor={userId?:string;service?:string;ip?:string;userAgent?:string};
