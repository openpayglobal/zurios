import {z} from "zod";

export const TenantCommandEnvelopeSchema=z.object({
 tenantId:z.string().min(1).max(128),
 idempotencyKey:z.string().min(8).max(200),
 correlationId:z.string().min(1).max(128),
 expectedVersion:z.number().int().nonnegative().optional(),
 issuedAt:z.string().datetime()
});
export type TenantCommandEnvelope=z.infer<typeof TenantCommandEnvelopeSchema>;

export const MoneySchema=z.object({
 currency:z.string().regex(/^[A-Z]{3}$/),
 amountMinor:z.number().int().nonnegative()
});
export type Money=z.infer<typeof MoneySchema>;

export const DomainEventEnvelopeSchema=z.object({
 eventId:z.string().min(1),
 tenantId:z.string().min(1),
 eventType:z.string().min(3),
 schemaVersion:z.number().int().positive(),
 occurredAt:z.string().datetime(),
 correlationId:z.string().min(1),
 idempotencyKey:z.string().min(8),
 payload:z.unknown()
});
export type DomainEventEnvelope=z.infer<typeof DomainEventEnvelopeSchema>;

export const AccountSchema=z.object({
 accountCode:z.string().min(1).max(32),
 name:z.string().min(2).max(160),
 accountType:z.enum(["asset","liability","equity","income","expense"]),
 normalBalance:z.enum(["debit","credit"]),
 parentAccountCode:z.string().min(1).max(32).optional(),
 requiresCostCenter:z.boolean().default(false),
 status:z.enum(["active","inactive"]).default("active")
});
export type Account=z.infer<typeof AccountSchema>;

export const JournalLineSchema=z.object({
 accountCode:z.string().min(1).max(32),
 debitMinor:z.number().int().nonnegative(),
 creditMinor:z.number().int().nonnegative(),
 currency:z.string().regex(/^[A-Z]{3}$/),
 memo:z.string().max(500).optional()
}).refine(line=>(line.debitMinor>0)!==(line.creditMinor>0),{
 message:"A journal line must contain exactly one positive debit or credit"
});
export type JournalLine=z.infer<typeof JournalLineSchema>;

export const JournalEntrySchema=z.object({
 tenantId:z.string().min(1),
 idempotencyKey:z.string().min(8).max(200),
 entryNumber:z.string().min(1).max(64),
 fiscalPeriodId:z.string().min(1),
 sourceType:z.string().min(2),
 sourceId:z.string().min(1),
 currency:z.string().regex(/^[A-Z]{3}$/),
 lines:z.array(JournalLineSchema).min(2),
 status:z.enum(["draft","posted","reversed"]),
 postedAt:z.string().datetime().optional(),
 reversalOfEntryId:z.string().min(1).optional()
}).superRefine((entry,ctx)=>{
 const debit=entry.lines.reduce((sum,line)=>sum+line.debitMinor,0);
 const credit=entry.lines.reduce((sum,line)=>sum+line.creditMinor,0);
 if(debit<=0||debit!==credit)ctx.addIssue({code:z.ZodIssueCode.custom,path:["lines"],message:"Journal debits and credits must balance to a positive amount"});
 if(entry.lines.some(line=>line.currency!==entry.currency))ctx.addIssue({code:z.ZodIssueCode.custom,path:["currency"],message:"All journal lines must use the entry currency"});
 if(entry.status==="posted"&&!entry.postedAt)ctx.addIssue({code:z.ZodIssueCode.custom,path:["postedAt"],message:"Posted journal entries require a posting timestamp"});
 if(entry.status==="reversed"&&!entry.reversalOfEntryId)ctx.addIssue({code:z.ZodIssueCode.custom,path:["reversalOfEntryId"],message:"Reversed entries must reference the original entry"});
});
export type JournalEntry=z.infer<typeof JournalEntrySchema>;

export const PurchaseOrderLineSchema=z.object({
 sku:z.string().min(1).max(100),
 description:z.string().min(1).max(250),
 quantityMilli:z.number().int().positive(),
 unitPriceMinor:z.number().int().nonnegative(),
 taxRateBps:z.number().int().min(0).max(10000)
});
export const PurchaseOrderSchema=z.object({
 tenantId:z.string().min(1),
 idempotencyKey:z.string().min(8).max(200),
 orderNumber:z.string().min(1).max(64),
 supplierId:z.string().min(1),
 warehouseId:z.string().min(1),
 currency:z.string().regex(/^[A-Z]{3}$/),
 orderedAt:z.string().datetime(),
 expectedAt:z.string().datetime().optional(),
 lines:z.array(PurchaseOrderLineSchema).min(1),
 totalMinor:z.number().int().positive(),
 status:z.enum(["draft","submitted","approved","partially_received","received","cancelled"])
}).superRefine((order,ctx)=>{
 if(order.expectedAt&&order.expectedAt<order.orderedAt)ctx.addIssue({code:z.ZodIssueCode.custom,path:["expectedAt"],message:"Expected delivery cannot precede order creation"});
 const subtotal=order.lines.reduce((sum,line)=>sum+Math.round(line.quantityMilli*line.unitPriceMinor/1000),0);
 const tax=order.lines.reduce((sum,line)=>sum+Math.round(Math.round(line.quantityMilli*line.unitPriceMinor/1000)*line.taxRateBps/10000),0);
 if(order.totalMinor!==subtotal+tax)ctx.addIssue({code:z.ZodIssueCode.custom,path:["totalMinor"],message:"Purchase order total must reconcile to line value plus tax"});
});
export type PurchaseOrder=z.infer<typeof PurchaseOrderSchema>;

export const PosSaleLineSchema=z.object({
 sku:z.string().min(1).max(100),
 description:z.string().min(1).max(250),
 quantityMilli:z.number().int().positive(),
 unitPriceMinor:z.number().int().nonnegative(),
 discountMinor:z.number().int().nonnegative().default(0),
 taxRateBps:z.number().int().min(0).max(10000)
});
export const PosTenderSchema=z.object({
 tenderId:z.string().min(1),
 method:z.enum(["cash","card","mobile_money","store_credit","voucher"]),
 amountMinor:z.number().int().positive(),
 currency:z.string().regex(/^[A-Z]{3}$/),
 status:z.enum(["pending","authorized","captured","failed","refunded"]),
 providerReference:z.string().max(200).optional()
});
export const PosSaleSchema=z.object({
 tenantId:z.string().min(1),
 idempotencyKey:z.string().min(8).max(200),
 saleId:z.string().min(1),
 reservationId:z.string().min(1).optional(),
 terminalId:z.string().min(1),
 cashierId:z.string().min(1),
 currency:z.string().regex(/^[A-Z]{3}$/),
 lines:z.array(PosSaleLineSchema).min(1),
 subtotalMinor:z.number().int().nonnegative(),
 taxMinor:z.number().int().nonnegative(),
 totalMinor:z.number().int().positive(),
 tenders:z.array(PosTenderSchema).default([]),
 status:z.enum(["open","held","completed","voided","refunded"]),
 completedAt:z.string().datetime().optional()
}).superRefine((sale,ctx)=>{
 let subtotal=0,tax=0;
 for(const [index,line] of sale.lines.entries()){
  const gross=Math.round(line.quantityMilli*line.unitPriceMinor/1000);
  if(line.discountMinor>gross)ctx.addIssue({code:z.ZodIssueCode.custom,path:["lines",index,"discountMinor"],message:"Discount cannot exceed the line gross"});
  const net=Math.max(0,gross-line.discountMinor);
  subtotal+=net;
  tax+=Math.round(net*line.taxRateBps/10000);
 }
 if(subtotal!==sale.subtotalMinor)ctx.addIssue({code:z.ZodIssueCode.custom,path:["subtotalMinor"],message:"Sale subtotal does not match its lines"});
 if(tax!==sale.taxMinor)ctx.addIssue({code:z.ZodIssueCode.custom,path:["taxMinor"],message:"Sale tax does not match its lines"});
 if(subtotal+tax!==sale.totalMinor)ctx.addIssue({code:z.ZodIssueCode.custom,path:["totalMinor"],message:"Sale total must equal subtotal plus tax"});
 if(sale.tenders.some(tender=>tender.currency!==sale.currency))ctx.addIssue({code:z.ZodIssueCode.custom,path:["tenders"],message:"Tender currency must match sale currency"});
 if(sale.status==="completed"){
  const captured=sale.tenders.filter(tender=>tender.status==="captured").reduce((sum,tender)=>sum+tender.amountMinor,0);
  if(captured!==sale.totalMinor)ctx.addIssue({code:z.ZodIssueCode.custom,path:["tenders"],message:"Completed sales require captured tenders equal to the sale total"});
  if(!sale.completedAt)ctx.addIssue({code:z.ZodIssueCode.custom,path:["completedAt"],message:"Completed sales require a completion timestamp"});
 }
});
export type PosSale=z.infer<typeof PosSaleSchema>;

export const WarehouseSchema=z.object({
 tenantId:z.string().min(1),
 warehouseId:z.string().min(1),
 code:z.string().min(1).max(32),
 name:z.string().min(2).max(160),
 locationId:z.string().min(1).optional(),
 status:z.enum(["active","inactive"])
});
export type Warehouse=z.infer<typeof WarehouseSchema>;

export const StockMovementSchema=z.object({
 tenantId:z.string().min(1),
 idempotencyKey:z.string().min(8).max(200),
 movementId:z.string().min(1),
 movementType:z.enum(["receipt","issue","transfer","adjustment","reserve","release","consume"]),
 sku:z.string().min(1).max(100),
 warehouseId:z.string().min(1),
 destinationWarehouseId:z.string().min(1).optional(),
 quantityMilli:z.number().int().positive(),
 unitCostMinor:z.number().int().nonnegative().optional(),
 currency:z.string().regex(/^[A-Z]{3}$/).optional(),
 referenceType:z.string().min(1),
 referenceId:z.string().min(1),
 reason:z.string().min(3).max(500).optional(),
 adjustmentDirection:z.enum(["increase","decrease"]).optional(),
 occurredAt:z.string().datetime()
}).superRefine((movement,ctx)=>{
 if(movement.movementType==="transfer"){
  if(!movement.destinationWarehouseId)ctx.addIssue({code:z.ZodIssueCode.custom,path:["destinationWarehouseId"],message:"Transfers require a destination warehouse"});
  if(movement.destinationWarehouseId===movement.warehouseId)ctx.addIssue({code:z.ZodIssueCode.custom,path:["destinationWarehouseId"],message:"Transfer source and destination must differ"});
 }else if(movement.destinationWarehouseId){
  ctx.addIssue({code:z.ZodIssueCode.custom,path:["destinationWarehouseId"],message:"Only transfers may specify a destination warehouse"});
 }
 if(movement.movementType==="adjustment"&&!movement.reason)ctx.addIssue({code:z.ZodIssueCode.custom,path:["reason"],message:"Adjustments require an auditable reason"});
 if(movement.movementType==="adjustment"&&!movement.adjustmentDirection)ctx.addIssue({code:z.ZodIssueCode.custom,path:["adjustmentDirection"],message:"Adjustments require an increase or decrease direction"});
 if(movement.movementType!=="adjustment"&&movement.adjustmentDirection)ctx.addIssue({code:z.ZodIssueCode.custom,path:["adjustmentDirection"],message:"Adjustment direction is only valid for adjustments"});
 if(movement.unitCostMinor!==undefined&&!movement.currency)ctx.addIssue({code:z.ZodIssueCode.custom,path:["currency"],message:"Costed movements require a currency"});
});
export type StockMovement=z.infer<typeof StockMovementSchema>;

export const StockReservationSchema=z.object({
 tenantId:z.string().min(1),
 idempotencyKey:z.string().min(8).max(200),
 reservationId:z.string().min(1),
 orderId:z.string().min(1),
 warehouseId:z.string().min(1),
 lines:z.array(z.object({sku:z.string().min(1),quantityMilli:z.number().int().positive()})).min(1),
 status:z.enum(["reserved","committed","released","expired"]),
 expiresAt:z.string().datetime()
});
export type StockReservation=z.infer<typeof StockReservationSchema>;

export const ERP_EVENT_TYPES=["erp.purchase_order.submitted","erp.purchase_order.received","erp.invoice.issued","erp.journal.posted"] as const;
export const POS_EVENT_TYPES=["pos.sale.completed","pos.sale.voided","pos.refund.completed","pos.tender.captured"] as const;
export const INVENTORY_EVENT_TYPES=["inventory.stock.received","inventory.stock.issued","inventory.stock.transferred","inventory.stock.adjusted","inventory.stock.reserved","inventory.stock.consumed"] as const;

export const FiscalPeriodSchema=z.object({
 tenantId:z.string().min(1),periodId:z.string().min(1),periodCode:z.string().min(1).max(32),
 startsAt:z.string().datetime(),endsAt:z.string().datetime(),status:z.enum(["open","closed"])
}).refine(period=>period.endsAt>=period.startsAt,{message:"Fiscal period end must not precede its start",path:["endsAt"]});
export type FiscalPeriod=z.infer<typeof FiscalPeriodSchema>;

export const InvoiceLineSchema=z.object({
 description:z.string().min(1).max(250),quantityMilli:z.number().int().positive(),
 unitPriceMinor:z.number().int().nonnegative(),discountMinor:z.number().int().nonnegative().default(0),
 taxRateBps:z.number().int().min(0).max(10000)
});
export const InvoiceSchema=z.object({
 tenantId:z.string().min(1),idempotencyKey:z.string().min(8).max(200),
 invoiceId:z.string().min(1),invoiceNumber:z.string().min(1).max(64),
 invoiceType:z.enum(["sales","purchase"]),partyId:z.string().min(1),
 currency:z.string().regex(/^[A-Z]{3}$/),issuedAt:z.string().datetime(),dueAt:z.string().datetime(),
 lines:z.array(InvoiceLineSchema).min(1),subtotalMinor:z.number().int().nonnegative(),
 taxMinor:z.number().int().nonnegative(),totalMinor:z.number().int().positive(),
 status:z.enum(["draft","issued","partially_paid","paid","void"])
}).superRefine((invoice,ctx)=>{
 let subtotal=0,tax=0;
 for(const [index,line] of invoice.lines.entries()){
  const gross=Math.round(line.quantityMilli*line.unitPriceMinor/1000);
  if(line.discountMinor>gross)ctx.addIssue({code:z.ZodIssueCode.custom,path:["lines",index,"discountMinor"],message:"Invoice discount cannot exceed line gross"});
  const net=Math.max(0,gross-line.discountMinor);subtotal+=net;tax+=Math.round(net*line.taxRateBps/10000);
 }
 if(subtotal!==invoice.subtotalMinor)ctx.addIssue({code:z.ZodIssueCode.custom,path:["subtotalMinor"],message:"Invoice subtotal does not match its lines"});
 if(tax!==invoice.taxMinor)ctx.addIssue({code:z.ZodIssueCode.custom,path:["taxMinor"],message:"Invoice tax does not match its lines"});
 if(subtotal+tax!==invoice.totalMinor)ctx.addIssue({code:z.ZodIssueCode.custom,path:["totalMinor"],message:"Invoice total must equal subtotal plus tax"});
 if(invoice.dueAt<invoice.issuedAt)ctx.addIssue({code:z.ZodIssueCode.custom,path:["dueAt"],message:"Invoice due date cannot precede issue date"});
});
export type Invoice=z.infer<typeof InvoiceSchema>;

export const PaymentAllocationSchema=z.object({
 tenantId:z.string().min(1),idempotencyKey:z.string().min(8).max(200),
 paymentId:z.string().min(1),invoiceId:z.string().min(1),
 amountMinor:z.number().int().positive(),currency:z.string().regex(/^[A-Z]{3}$/),
 allocatedAt:z.string().datetime()
});
export type PaymentAllocation=z.infer<typeof PaymentAllocationSchema>;

export const PosTerminalSchema=z.object({
 tenantId:z.string().min(1),terminalId:z.string().min(1),code:z.string().min(1).max(32),
 locationId:z.string().min(1),deviceId:z.string().min(1),
 status:z.enum(["active","inactive","maintenance"])
});
export type PosTerminal=z.infer<typeof PosTerminalSchema>;

export const CashierShiftSchema=z.object({
 tenantId:z.string().min(1),shiftId:z.string().min(1),terminalId:z.string().min(1),
 cashierId:z.string().min(1),currency:z.string().regex(/^[A-Z]{3}$/),
 openedAt:z.string().datetime(),openingFloatMinor:z.number().int().nonnegative(),
 status:z.enum(["open","closed"]),expectedCashMinor:z.number().int().nonnegative().optional(),
 closingCountedMinor:z.number().int().nonnegative().optional(),closedAt:z.string().datetime().optional()
}).superRefine((shift,ctx)=>{
 if(shift.status==="closed"&&(shift.expectedCashMinor===undefined||shift.closingCountedMinor===undefined||!shift.closedAt)){
  ctx.addIssue({code:z.ZodIssueCode.custom,path:["closedAt"],message:"Closed shifts require expected cash, counted cash and a close timestamp"});
 }
 if(shift.status==="open"&&(shift.closedAt||shift.closingCountedMinor!==undefined)){
  ctx.addIssue({code:z.ZodIssueCode.custom,path:["status"],message:"Open shifts cannot carry closing values"});
 }
});
export type CashierShift=z.infer<typeof CashierShiftSchema>;

export const PosRefundSchema=z.object({
 tenantId:z.string().min(1),idempotencyKey:z.string().min(8).max(200),
 refundId:z.string().min(1),saleId:z.string().min(1),
 originalSaleTotalMinor:z.number().int().positive(),amountMinor:z.number().int().positive(),
 currency:z.string().regex(/^[A-Z]{3}$/),reason:z.string().min(3).max(500),
 status:z.enum(["pending","completed","rejected"]),completedAt:z.string().datetime().optional()
}).superRefine((refund,ctx)=>{
 if(refund.amountMinor>refund.originalSaleTotalMinor)ctx.addIssue({code:z.ZodIssueCode.custom,path:["amountMinor"],message:"Refund cannot exceed the original sale total"});
 if(refund.status==="completed"&&!refund.completedAt)ctx.addIssue({code:z.ZodIssueCode.custom,path:["completedAt"],message:"Completed refunds require a timestamp"});
});
export type PosRefund=z.infer<typeof PosRefundSchema>;

export const StockBalanceSchema=z.object({
 tenantId:z.string().min(1),warehouseId:z.string().min(1),sku:z.string().min(1),
 quantityOnHandMilli:z.number().int().nonnegative(),quantityReservedMilli:z.number().int().nonnegative(),
 quantityAvailableMilli:z.number().int().nonnegative(),version:z.number().int().nonnegative()
}).superRefine((balance,ctx)=>{
 if(balance.quantityReservedMilli>balance.quantityOnHandMilli)ctx.addIssue({code:z.ZodIssueCode.custom,path:["quantityReservedMilli"],message:"Reserved quantity cannot exceed on-hand quantity"});
 if(balance.quantityAvailableMilli!==balance.quantityOnHandMilli-balance.quantityReservedMilli)ctx.addIssue({code:z.ZodIssueCode.custom,path:["quantityAvailableMilli"],message:"Available stock must equal on-hand less reserved"});
});
export type StockBalance=z.infer<typeof StockBalanceSchema>;

export const InventoryValuationSchema=z.object({
 tenantId:z.string().min(1),warehouseId:z.string().min(1),sku:z.string().min(1),
 costingMethod:z.enum(["fifo","weighted_average","standard"]),
 quantityMilli:z.number().int().nonnegative(),unitCostMinor:z.number().int().nonnegative(),
 totalValueMinor:z.number().int().nonnegative(),currency:z.string().regex(/^[A-Z]{3}$/)
}).refine(value=>value.totalValueMinor===Math.round(value.quantityMilli*value.unitCostMinor/1000),{
 message:"Inventory value must reconcile to quantity and unit cost",path:["totalValueMinor"]
});
export type InventoryValuation=z.infer<typeof InventoryValuationSchema>;

export const ReorderPolicySchema=z.object({
 tenantId:z.string().min(1),warehouseId:z.string().min(1),sku:z.string().min(1),
 minimumQuantityMilli:z.number().int().nonnegative(),reorderQuantityMilli:z.number().int().positive(),
 maximumQuantityMilli:z.number().int().positive(),leadTimeDays:z.number().int().nonnegative()
}).refine(policy=>policy.minimumQuantityMilli<=policy.reorderQuantityMilli&&policy.reorderQuantityMilli<=policy.maximumQuantityMilli,{
 message:"Reorder quantity must be between minimum and maximum levels",path:["reorderQuantityMilli"]
});
export type ReorderPolicy=z.infer<typeof ReorderPolicySchema>;
