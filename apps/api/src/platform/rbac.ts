import type {PlatformPrincipal} from "./types.js";
export type RoleDefinition={key:string;permissions:string[]};
export function resolvePermissions(roleKeys:string[],roles:RoleDefinition[]):string[]{
 const byKey=new Map(roles.map(role=>[role.key,role]));
 const permissions=new Set<string>();
 for(const key of roleKeys){for(const permission of byKey.get(key)?.permissions??[])permissions.add(permission);}
 return [...permissions];
}
export function hasPermission(principal:PlatformPrincipal,permission:string):boolean{
 return principal.permissions.includes("*")||principal.permissions.includes(permission);
}
