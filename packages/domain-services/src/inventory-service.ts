import {randomUUID} from "node:crypto";
import type {ClientSession,Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {StockMovementSchema,StockReservationSchema} from "@zuri/domain-contracts";

type Balance={tenantId:string;warehouseId:string;sku:string;quantityOnHandMilli:number;quantityReservedMilli:number;quantityAvailableMilli:number;version:number;updatedAt:Date};
type Reservation={tenantId:string;reservationId:string;orderId:string;warehouseId:string;lines:{sku:string;quantityMilli:number}[];status:"reserved"|"committed"|"released"|"expired";expiresAt:Date;createdAt:Date;updatedAt:Date};
type Delta={onHand:number;reserved:number;movementId:string;movementType:string;referenceType:string;referenceId:string;actorId:string;reason?:string;occurredAt:Date;leg:string};

async function changeBalance(db:Db,session:ClientSession,tenantId:string,warehouseId:string,sku:string,onHandDelta:number,reservedDelta:number){
 const c=db.collection<Balance>("inventory_stock_balances");
 const current=await c.findOne({tenantId,warehouseId,sku},{session});
 const onHand=(current?.quantityOnHandMilli??0)+onHandDelta;
 const reserved=(current?.quantityReservedMilli??0)+reservedDelta;
 if(onHand<0)throw new Error("INSUFFICIENT_STOCK_ON_HAND");
 if(reserved<0)throw new Error("INSUFFICIENT_RESERVED_STOCK");
 if(reserved>onHand)throw new Error("RESERVATION_EXCEEDS_ON_HAND");
 const next:Balance={tenantId,warehouseId,sku,quantityOnHandMilli:onHand,quantityReservedMilli:reserved,quantityAvailableMilli:onHand-reserved,version:(current?.version??0)+1,updatedAt:new Date()};
 if(current){
  const result=await c.updateOne({tenantId,warehouseId,sku,version:current.version},{$set:next},{session});
  if(result.matchedCount!==1)throw new Error("STOCK_CONCURRENT_MODIFICATION");
 }else await c.insertOne(next,{session});
 return next;
}
async function writeLedger(db:Db,session:ClientSession,delta:Delta,tenantId:string,warehouseId:string,sku:string,quantityMilli:number){
 await db.collection("inventory_stock_ledger").insertOne({
  ledgerId:randomUUID(),tenantId,movementId:delta.movementId,leg:delta.leg,movementType:delta.movementType,
  warehouseId,sku,quantityMilli,onHandDeltaMilli:delta.onHand,reservedDeltaMilli:delta.reserved,
  referenceType:delta.referenceType,referenceId:delta.referenceId,actorId:delta.actorId,
  ...(delta.reason?{reason:delta.reason}:{}),occurredAt:delta.occurredAt,createdAt:new Date()
 },{session});
}
async function applyDelta(db:Db,session:ClientSession,delta:Delta,tenantId:string,warehouseId:string,sku:string,quantityMilli:number){
 await changeBalance(db,session,tenantId,warehouseId,sku,delta.onHand,delta.reserved);
 await writeLedger(db,session,delta,tenantId,warehouseId,sku,quantityMilli);
}
export async function recordStockMovement(db:Db,input:unknown,actorId:string){
 const movement=StockMovementSchema.parse(input);
 if(!["receipt","issue","transfer","adjustment"].includes(movement.movementType))throw new Error("USE_RESERVATION_COMMAND_FOR_RESERVED_STOCK");
 if(movement.movementType==="adjustment"&&!movement.adjustmentDirection)throw new Error("ADJUSTMENT_DIRECTION_REQUIRED");
 const now=new Date(movement.occurredAt);
 return runIdempotentMutation(db,{tenantId:movement.tenantId,actorId,operation:"inventory.stock_movement",key:movement.idempotencyKey,request:movement},async session=>{
  const sourceWarehouse=await db.collection("inventory_warehouses").findOne({tenantId:movement.tenantId,warehouseId:movement.warehouseId,status:"active"},{session});\n  if(!sourceWarehouse)throw new Error("SOURCE_WAREHOUSE_NOT_ACTIVE");\n  if(movement.destinationWarehouseId){const destination=await db.collection("inventory_warehouses").findOne({tenantId:movement.tenantId,warehouseId:movement.destinationWarehouseId,status:"active"},{session});if(!destination)throw new Error("DESTINATION_WAREHOUSE_NOT_ACTIVE");}\n  const delta=movement.movementType==="receipt"?movement.quantityMilli:
   movement.movementType==="adjustment"?(movement.adjustmentDirection==="increase"?movement.quantityMilli:-movement.quantityMilli):-movement.quantityMilli;
  if(movement.movementType==="transfer"){
   await applyDelta(db,session,{onHand:-movement.quantityMilli,reserved:0,movementId:movement.movementId,movementType:"transfer_out",referenceType:movement.referenceType,referenceId:movement.referenceId,actorId,occurredAt:now,leg:"source"},movement.tenantId,movement.warehouseId,movement.sku,movement.quantityMilli);
   await applyDelta(db,session,{onHand:movement.quantityMilli,reserved:0,movementId:movement.movementId,movementType:"transfer_in",referenceType:movement.referenceType,referenceId:movement.referenceId,actorId,occurredAt:now,leg:"destination"},movement.tenantId,movement.destinationWarehouseId!,movement.sku,movement.quantityMilli);
  }else{
   await applyDelta(db,session,{onHand:delta,reserved:0,movementId:movement.movementId,movementType:movement.movementType,referenceType:movement.referenceType,referenceId:movement.referenceId,actorId,...(movement.reason?{reason:movement.reason}:{}),occurredAt:now,leg:"single"},movement.tenantId,movement.warehouseId,movement.sku,movement.quantityMilli);
  }
  const suffix=movement.movementType==="receipt"?"received":movement.movementType==="issue"?"issued":movement.movementType==="transfer"?"transferred":"adjusted";\n  await appendOutboxEvent(db,session,{tenantId:movement.tenantId,eventType:"inventory.stock."+suffix,aggregateType:"stock",aggregateId:movement.warehouseId,payload:{movementId:movement.movementId,sku:movement.sku,quantityMilli:movement.quantityMilli,warehouseId:movement.warehouseId,...(movement.destinationWarehouseId?{destinationWarehouseId:movement.destinationWarehouseId}:{})}});
  return {statusCode:201,body:{movementId:movement.movementId}};
 });
}
async function settleReservation(db:Db,session:ClientSession,tenantId:string,reservationId:string,actorId:string,action:"commit"|"release"){
 const c=db.collection<Reservation>("inventory_reservations");
 const reservation=await c.findOne({tenantId,reservationId,status:"reserved"},{session});
 if(!reservation)throw new Error("ACTIVE_RESERVATION_NOT_FOUND");
 if(action==="commit"&&reservation.expiresAt<=new Date())throw new Error("RESERVATION_EXPIRED");
 const movementId=action+":"+reservationId,now=new Date();
 for(const line of reservation.lines){
  await applyDelta(db,session,{onHand:action==="commit"?-line.quantityMilli:0,reserved:-line.quantityMilli,movementId,movementType:action==="commit"?"consume":"release",referenceType:"reservation",referenceId:reservationId,actorId,occurredAt:now,leg:line.sku},tenantId,reservation.warehouseId,line.sku,line.quantityMilli);
 }
 await c.updateOne({tenantId,reservationId,status:"reserved"},{$set:{status:action==="commit"?"committed":"released",updatedAt:now}},{session});
 await appendOutboxEvent(db,session,{tenantId,eventType:action==="commit"?"inventory.stock.consumed":"inventory.stock.reserved",aggregateType:"reservation",aggregateId:reservationId,payload:{reservationId,orderId:reservation.orderId,warehouseId:reservation.warehouseId,lines:reservation.lines}});
}
export async function reserveStock(db:Db,input:unknown,actorId:string){
 const reservation=StockReservationSchema.parse(input);
 if(reservation.status!=="reserved")throw new Error("NEW_RESERVATION_MUST_BE_RESERVED");
 const expiresAt=new Date(reservation.expiresAt);
 if(expiresAt<=new Date())throw new Error("RESERVATION_EXPIRY_MUST_BE_FUTURE");
 return runIdempotentMutation(db,{tenantId:reservation.tenantId,actorId,operation:"inventory.reserve_stock",key:reservation.idempotencyKey,request:reservation},async session=>{
  for(const line of reservation.lines){
   await applyDelta(db,session,{onHand:0,reserved:line.quantityMilli,movementId:reservation.reservationId,movementType:"reserve",referenceType:"order",referenceId:reservation.orderId,actorId,occurredAt:new Date(),leg:line.sku},reservation.tenantId,reservation.warehouseId,line.sku,line.quantityMilli);
  }
  const now=new Date();
  await db.collection<Reservation>("inventory_reservations").insertOne({...reservation,expiresAt,createdAt:now,updatedAt:now},{session});
  await appendOutboxEvent(db,session,{tenantId:reservation.tenantId,eventType:"inventory.stock.reserved",aggregateType:"reservation",aggregateId:reservation.reservationId,payload:{reservationId:reservation.reservationId,orderId:reservation.orderId,warehouseId:reservation.warehouseId,lines:reservation.lines}});
  return {statusCode:201,body:{reservationId:reservation.reservationId}};
 });
}
export async function commitReservation(db:Db,tenantId:string,reservationId:string,actorId:string,key:string){
 return runIdempotentMutation(db,{tenantId,actorId,operation:"inventory.commit_reservation",key,request:{reservationId}},async session=>{
  await settleReservation(db,session,tenantId,reservationId,actorId,"commit");
  return {statusCode:200,body:{reservationId,status:"committed"}};
 });
}
export async function releaseReservation(db:Db,tenantId:string,reservationId:string,actorId:string,key:string){
 return runIdempotentMutation(db,{tenantId,actorId,operation:"inventory.release_reservation",key,request:{reservationId}},async session=>{
  await settleReservation(db,session,tenantId,reservationId,actorId,"release");
  return {statusCode:200,body:{reservationId,status:"released"}};
 });
}
export async function commitReservationInTransaction(db:Db,session:ClientSession,tenantId:string,reservationId:string,actorId:string){
 await settleReservation(db,session,tenantId,reservationId,actorId,"commit");
}
