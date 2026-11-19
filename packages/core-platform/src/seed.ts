import type {Db} from "mongodb";
import {coreCollections} from "./repositories.js";
/** Idempotent, non-production demo seed. Does not create privileged wildcard roles. */
export async function seedPlatform(db:Db,tenantId:string,actorId="system:seed"){
 const c=coreCollections(db),now=new Date();
 const roles=[
  {roleId:"rol_tenant_viewer",key:"tenant.viewer",name:"Tenant Viewer",permissionKeys:["platform.read"]},
  {roleId:"rol_inventory_viewer",key:"inventory.viewer",name:"Inventory Viewer",permissionKeys:["inventory.products.read","inventory.locations.read","inventory.movements.read","inventory.balances.read"]},
  {roleId:"rol_inventory_manager",key:"inventory.manager",name:"Inventory Manager",permissionKeys:["inventory.products.read","inventory.products.create","inventory.locations.read","inventory.locations.create","inventory.lots.create","inventory.movements.read","inventory.movements.create","inventory.transfers.create","inventory.balances.read"]},
  {roleId:"rol_inventory_adjustment_approver",key:"inventory.adjustment.approver",name:"Inventory Adjustment Approver",permissionKeys:["inventory.products.read","inventory.locations.read","inventory.movements.read","inventory.movements.create","inventory.adjustments.approve","inventory.balances.read"]}
 ];
 for(const role of roles){
  await c.roles.updateOne({tenantId,key:role.key},{$setOnInsert:{tenantId,...role,isSystem:true,status:"active",createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId}},{upsert:true});
 }
}
