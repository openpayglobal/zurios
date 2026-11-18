import type {Db} from "mongodb";
import {coreCollections} from "./repositories.js";
/** Idempotent, non-production demo seed. Does not create privileged wildcard roles. */
export async function seedPlatform(db:Db,tenantId:string,actorId="system:seed"){
 const c=coreCollections(db),now=new Date();
 await c.roles.updateOne({tenantId,key:"tenant.viewer"},{$setOnInsert:{tenantId,roleId:"rol_tenant_viewer",key:"tenant.viewer",name:"Tenant Viewer",permissionKeys:["platform.read"],isSystem:true,status:"active",createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId}},{upsert:true});
}
