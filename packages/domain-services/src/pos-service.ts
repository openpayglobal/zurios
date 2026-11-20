import type {Db} from "mongodb";
import {appendOutboxEvent,runIdempotentMutation} from "@zuri/core-platform";
import {auditDomainMutation} from "./audit.js";
import {CashierShiftSchema,PosRefundSchema,PosSaleSchema,PosTerminalSchema} from "@zuri/domain-contracts";
import {commitReservationInTransaction} from "./inventory-service.js";

export async function registerPosTerminal(db:Db,input:unknown,actorId:string,idempotencyKey?:string){
 const terminal=PosTerminalSchema.parse(input);
 return runIdempotentMutation(db,{tenantId:terminal.tenantId,actorId,operation:"pos.terminal.register",key:idempotencyKey??"terminal-"+terminal.terminalId,request:terminal},async session=>{
  await db.collection("pos_terminals").insertOne({...terminal,createdAt:new Date(),updatedAt:new Date(),createdBy:actorId},{session});
  await auditDomainMutation(db,session,terminal.tenantId,actorId,"pos.terminal.registered","pos_terminal",terminal.terminalId);
  return {statusCode:201,body:{terminalId:terminal.terminalId}};
 });
}
export async function openCashierShift(db:Db,input:unknown,actorId:string,idempotencyKey?:string){
 const shift=CashierShiftSchema.parse(input);
 if(shift.status!=="open")throw new Error("NEW_SHIFT_MUST_BE_OPEN");
 return runIdempotentMutation(db,{tenantId:shift.tenantId,actorId,operation:"pos.shift.open",key:idempotencyKey??"shift-open-"+shift.shiftId,request:shift},async session=>{
  const terminal=await db.collection("pos_terminals").findOne({tenantId:shift.tenantId,terminalId:shift.terminalId,status:"active"},{session});
  if(!terminal)throw new Error("POS_TERMINAL_NOT_ACTIVE");
  if(await db.collection("pos_cashier_shifts").findOne({tenantId:shift.tenantId,terminalId:shift.terminalId,status:"open"},{session}))throw new Error("POS_TERMINAL_SHIFT_ALREADY_OPEN");
  await db.collection("pos_cashier_shifts").insertOne({...shift,openedAt:new Date(shift.openedAt),createdAt:new Date(),createdBy:actorId},{session});
  await auditDomainMutation(db,session,shift.tenantId,actorId,"pos.shift.opened","pos_shift",shift.shiftId,{terminalId:shift.terminalId,cashierId:shift.cashierId});
  await appendOutboxEvent(db,session,{tenantId:shift.tenantId,eventType:"pos.shift.opened",aggregateType:"pos_shift",aggregateId:shift.shiftId,payload:{shiftId:shift.shiftId,terminalId:shift.terminalId,cashierId:shift.cashierId,currency:shift.currency}});
  return {statusCode:201,body:{shiftId:shift.shiftId}};
 });
}
export async function closeCashierShift(db:Db,tenantId:string,shiftId:string,actorId:string,key:string,expectedCashMinor:number,countedCashMinor:number){
 if(!Number.isSafeInteger(expectedCashMinor)||expectedCashMinor<0||!Number.isSafeInteger(countedCashMinor)||countedCashMinor<0)throw new Error("INVALID_SHIFT_RECONCILIATION");
 return runIdempotentMutation(db,{tenantId,actorId,operation:"pos.shift.close",key,request:{shiftId,expectedCashMinor,countedCashMinor}},async session=>{
  const now=new Date();
  const result=await db.collection("pos_cashier_shifts").updateOne({tenantId,shiftId,status:"open"},{$set:{status:"closed",expectedCashMinor,closingCountedMinor:countedCashMinor,closedAt:now,closedBy:actorId}},{session});
  if(result.matchedCount!==1)throw new Error("OPEN_CASHIER_SHIFT_NOT_FOUND");
  await auditDomainMutation(db,session,tenantId,actorId,"pos.shift.closed","pos_shift",shiftId,{expectedCashMinor,countedCashMinor,varianceMinor:countedCashMinor-expectedCashMinor});
  await appendOutboxEvent(db,session,{tenantId,eventType:"pos.shift.closed",aggregateType:"pos_shift",aggregateId:shiftId,payload:{shiftId,expectedCashMinor,countedCashMinor,varianceMinor:countedCashMinor-expectedCashMinor}});
  return {statusCode:200,body:{shiftId,varianceMinor:countedCashMinor-expectedCashMinor}};
 });
}
export async function completePosSale(db:Db,input:unknown,actorId:string){
 const sale=PosSaleSchema.parse(input);
 if(sale.status!=="completed")throw new Error("SALE_MUST_BE_COMPLETED");
 return runIdempotentMutation(db,{tenantId:sale.tenantId,actorId,operation:"pos.sale.complete",key:sale.idempotencyKey,request:sale},async session=>{
  const terminal=await db.collection("pos_terminals").findOne({tenantId:sale.tenantId,terminalId:sale.terminalId,status:"active"},{session});
  if(!terminal)throw new Error("POS_TERMINAL_NOT_ACTIVE");
  const shift=await db.collection("pos_cashier_shifts").findOne({tenantId:sale.tenantId,terminalId:sale.terminalId,cashierId:sale.cashierId,status:"open",currency:sale.currency},{session});
  if(!shift)throw new Error("OPEN_CASHIER_SHIFT_REQUIRED");
  if(sale.reservationId){
   const reservation=await db.collection<any>("inventory_reservations").findOne({tenantId:sale.tenantId,reservationId:sale.reservationId,status:"reserved"},{session});
   if(!reservation)throw new Error("ACTIVE_RESERVATION_NOT_FOUND");
   const sold=new Map<string,number>();for(const line of sale.lines)sold.set(line.sku,(sold.get(line.sku)??0)+line.quantityMilli);
   const reserved=new Map<string,number>();for(const line of reservation.lines)reserved.set(line.sku,(reserved.get(line.sku)??0)+line.quantityMilli);
   if(sold.size!==reserved.size||[...sold].some(([sku,qty])=>reserved.get(sku)!==qty))throw new Error("SALE_RESERVATION_LINES_MISMATCH");
   await commitReservationInTransaction(db,session,sale.tenantId,sale.reservationId,actorId);
  }
  const now=new Date();
  await db.collection("pos_sales").insertOne({...sale,completedAt:sale.completedAt?new Date(sale.completedAt):now,shiftId:shift.shiftId,createdAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,sale.tenantId,actorId,"pos.sale.completed","pos_sale",sale.saleId,{terminalId:sale.terminalId,totalMinor:sale.totalMinor,currency:sale.currency});
  await appendOutboxEvent(db,session,{tenantId:sale.tenantId,eventType:"pos.sale.completed",aggregateType:"pos_sale",aggregateId:sale.saleId,payload:{saleId:sale.saleId,terminalId:sale.terminalId,cashierId:sale.cashierId,totalMinor:sale.totalMinor,currency:sale.currency,lines:sale.lines}});
  return {statusCode:201,body:{saleId:sale.saleId,status:"completed"}};
 });
}
export async function refundPosSale(db:Db,input:unknown,actorId:string){
 const refund=PosRefundSchema.parse(input);
 if(refund.status!=="completed")throw new Error("REFUND_MUST_BE_COMPLETED");
 return runIdempotentMutation(db,{tenantId:refund.tenantId,actorId,operation:"pos.sale.refund",key:refund.idempotencyKey,request:refund},async session=>{
  const sale=await db.collection<any>("pos_sales").findOne({tenantId:refund.tenantId,saleId:refund.saleId,status:"completed"},{session});
  if(!sale)throw new Error("COMPLETED_POS_SALE_NOT_FOUND");
  if(sale.currency!==refund.currency)throw new Error("REFUND_CURRENCY_MISMATCH");
  const now=new Date();
  const refundGuard=await db.collection("pos_sales").updateOne({tenantId:refund.tenantId,saleId:refund.saleId,status:"completed",$or:[{refundedMinor:{$exists:false}},{refundedMinor:{$lte:sale.totalMinor-refund.amountMinor}}]},{$inc:{refundedMinor:refund.amountMinor},$set:{updatedAt:now}},{session});
  if(refundGuard.matchedCount!==1)throw new Error("REFUNDS_EXCEED_SALE_TOTAL");
  const nextRefunded=(sale.refundedMinor??0)+refund.amountMinor;
  await db.collection("pos_sales").updateOne({tenantId:refund.tenantId,saleId:refund.saleId},{$set:{refundedMinor:nextRefunded,status:nextRefunded===sale.totalMinor?"refunded":"completed",updatedAt:now}},{session});
  await db.collection("pos_refunds").insertOne({...refund,completedAt:refund.completedAt?new Date(refund.completedAt):now,createdAt:now,createdBy:actorId},{session});
  await auditDomainMutation(db,session,refund.tenantId,actorId,"pos.refund.completed","pos_refund",refund.refundId,{saleId:refund.saleId,amountMinor:refund.amountMinor,currency:refund.currency});
  await appendOutboxEvent(db,session,{tenantId:refund.tenantId,eventType:"pos.refund.completed",aggregateType:"pos_refund",aggregateId:refund.refundId,payload:{refundId:refund.refundId,saleId:refund.saleId,amountMinor:refund.amountMinor,currency:refund.currency,reason:refund.reason}});
  return {statusCode:201,body:{refundId:refund.refundId,status:"completed"}};
 });
}
export async function acceptOfflinePosCommand(db:Db,input:{tenantId:string;terminalId:string;commandId:string;sequence:number;commandType:string;payload:Record<string,unknown>;issuedAt:string},actorId:string,idempotencyKey?:string){
 if(!Number.isSafeInteger(input.sequence)||input.sequence<1)throw new Error("INVALID_OFFLINE_SEQUENCE");
 if(input.commandId.length<8)throw new Error("INVALID_OFFLINE_COMMAND_ID");
 return runIdempotentMutation(db,{tenantId:input.tenantId,actorId,operation:"pos.offline.command",key:idempotencyKey??input.commandId,request:input},async session=>{
  const terminal=await db.collection("pos_terminals").findOne({tenantId:input.tenantId,terminalId:input.terminalId},{session});
  if(!terminal)throw new Error("POS_TERMINAL_NOT_FOUND");
  const existing=await db.collection("pos_offline_commands").findOne({tenantId:input.tenantId,terminalId:input.terminalId,sequence:input.sequence},{session});
  if(existing)throw new Error("OFFLINE_SEQUENCE_ALREADY_USED");
  await db.collection("pos_offline_commands").insertOne({...input,issuedAt:new Date(input.issuedAt),status:"accepted",acceptedAt:new Date(),actorId},{session});
  await auditDomainMutation(db,session,input.tenantId,actorId,"pos.offline.command.accepted","pos_offline_command",input.commandId,{terminalId:input.terminalId,sequence:input.sequence,commandType:input.commandType});
  await appendOutboxEvent(db,session,{tenantId:input.tenantId,eventType:"pos.offline.command.accepted",aggregateType:"pos_terminal",aggregateId:input.terminalId,payload:{terminalId:input.terminalId,commandId:input.commandId,sequence:input.sequence,commandType:input.commandType}});
  return {statusCode:202,body:{commandId:input.commandId,status:"accepted"}};
 });
}
