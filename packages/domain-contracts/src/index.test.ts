import test from "node:test";
import assert from "node:assert/strict";
import {JournalEntrySchema,PosSaleSchema,StockMovementSchema,DomainEventEnvelopeSchema,CarrierTrackingEventSchema} from "./index.js";

test("ERP journal entries require balanced debit and credit lines",()=>{
 const base={tenantId:"tenant-a",idempotencyKey:"journal-0000001",entryNumber:"JE-1",fiscalPeriodId:"FY-2026-11",sourceType:"manual",sourceId:"source-1",currency:"UGX",status:"posted",postedAt:"2026-11-19T08:00:00.000Z",lines:[
  {accountCode:"1000",debitMinor:100000,creditMinor:0,currency:"UGX"},
  {accountCode:"4000",debitMinor:0,creditMinor:100000,currency:"UGX"}
 ]};
 assert.equal(JournalEntrySchema.safeParse(base).success,true);
 assert.equal(JournalEntrySchema.safeParse({...base,lines:[base.lines[0],{...base.lines[1],creditMinor:90000}]}).success,false);
});

test("POS completed sale totals must reconcile to captured tenders",()=>{
 const sale={tenantId:"tenant-a",idempotencyKey:"pos-sale-000001",saleId:"sale-1",terminalId:"terminal-1",cashierId:"cashier-1",currency:"UGX",lines:[{sku:"SKU-1",description:"Item one",quantityMilli:1000,unitPriceMinor:5000,discountMinor:0,taxRateBps:0}],subtotalMinor:5000,taxMinor:0,totalMinor:5000,tenders:[{tenderId:"tender-1",method:"cash",amountMinor:5000,currency:"UGX",status:"captured"}],status:"completed",completedAt:"2026-11-19T08:00:00.000Z"};
 assert.equal(PosSaleSchema.safeParse(sale).success,true);
 assert.equal(PosSaleSchema.safeParse({...sale,tenders:[{...sale.tenders[0],amountMinor:4000}]}).success,false);
});

test("Inventory transfers require distinct source and destination warehouses",()=>{
 const movement={tenantId:"tenant-a",idempotencyKey:"stock-move-0001",movementId:"movement-1",movementType:"transfer",sku:"SKU-1",warehouseId:"warehouse-a",destinationWarehouseId:"warehouse-b",quantityMilli:1000,referenceType:"transfer",referenceId:"transfer-1",occurredAt:"2026-11-19T08:00:00.000Z"};
 assert.equal(StockMovementSchema.safeParse(movement).success,true);
 assert.equal(StockMovementSchema.safeParse({...movement,destinationWarehouseId:"warehouse-a"}).success,false);
});

test("Inventory adjustments require an auditable reason",()=>{
 const movement={tenantId:"tenant-a",idempotencyKey:"stock-adjust-0001",movementId:"movement-2",movementType:"adjustment",sku:"SKU-1",warehouseId:"warehouse-a",quantityMilli:1000,referenceType:"count",referenceId:"count-1",occurredAt:"2026-11-19T08:00:00.000Z"};
 assert.equal(StockMovementSchema.safeParse(movement).success,false);
 assert.equal(StockMovementSchema.safeParse({...movement,reason:"Cycle count variance",adjustmentDirection:"increase"}).success,true);
});

test("Domain events carry tenant, version, correlation and idempotency identity",()=>{
 const event={eventId:"evt-1",tenantId:"tenant-a",eventType:"inventory.stock.received",schemaVersion:1,occurredAt:"2026-11-19T08:00:00.000Z",correlationId:"corr-1",idempotencyKey:"stock-receipt-0001",payload:{sku:"SKU-1",quantityMilli:1000}};
 assert.equal(DomainEventEnvelopeSchema.safeParse(event).success,true);
 assert.equal(DomainEventEnvelopeSchema.safeParse({...event,idempotencyKey:"short"}).success,false);
});

import {CashierShiftSchema,InvoiceSchema,PosRefundSchema,StockBalanceSchema,InventoryValuationSchema,ReorderPolicySchema} from "./index.js";

test("ERP invoices reconcile line totals and dates",()=>{
 const invoice={tenantId:"tenant-a",idempotencyKey:"invoice-000001",invoiceId:"invoice-1",invoiceNumber:"INV-1",invoiceType:"sales",partyId:"customer-1",currency:"UGX",issuedAt:"2026-11-19T08:00:00.000Z",dueAt:"2026-12-19T08:00:00.000Z",lines:[{description:"Item",quantityMilli:1000,unitPriceMinor:2000,discountMinor:0,taxRateBps:0}],subtotalMinor:2000,taxMinor:0,totalMinor:2000,status:"issued"};
 assert.equal(InvoiceSchema.safeParse(invoice).success,true);
 assert.equal(InvoiceSchema.safeParse({...invoice,totalMinor:3000}).success,false);
});

test("POS closed cashier shifts require reconciliation values",()=>{
 const shift={tenantId:"tenant-a",shiftId:"shift-1",terminalId:"terminal-1",cashierId:"cashier-1",currency:"UGX",openedAt:"2026-11-19T08:00:00.000Z",openingFloatMinor:10000,status:"closed",expectedCashMinor:25000,closingCountedMinor:25000,closedAt:"2026-11-19T18:00:00.000Z"};
 assert.equal(CashierShiftSchema.safeParse(shift).success,true);
 assert.equal(CashierShiftSchema.safeParse({...shift,closedAt:undefined}).success,false);
});

test("POS refunds require reason and cannot exceed original sale value",()=>{
 const refund={tenantId:"tenant-a",idempotencyKey:"refund-000001",refundId:"refund-1",saleId:"sale-1",originalSaleTotalMinor:5000,amountMinor:2000,currency:"UGX",reason:"Returned damaged item",status:"completed",completedAt:"2026-11-19T10:00:00.000Z"};
 assert.equal(PosRefundSchema.safeParse(refund).success,true);
 assert.equal(PosRefundSchema.safeParse({...refund,amountMinor:6000}).success,false);
});

test("Inventory stock balance reconciles available and reserved quantities",()=>{
 const balance={tenantId:"tenant-a",warehouseId:"warehouse-a",sku:"SKU-1",quantityOnHandMilli:10000,quantityReservedMilli:2500,quantityAvailableMilli:7500,version:1};
 assert.equal(StockBalanceSchema.safeParse(balance).success,true);
 assert.equal(StockBalanceSchema.safeParse({...balance,quantityAvailableMilli:8000}).success,false);
});

test("Inventory valuation and reorder levels preserve arithmetic invariants",()=>{
 const valuation={tenantId:"tenant-a",warehouseId:"warehouse-a",sku:"SKU-1",costingMethod:"weighted_average",quantityMilli:2000,unitCostMinor:500,totalValueMinor:1000,currency:"UGX"};
 assert.equal(InventoryValuationSchema.safeParse(valuation).success,true);
 assert.equal(InventoryValuationSchema.safeParse({...valuation,totalValueMinor:1200}).success,false);
 const policy={tenantId:"tenant-a",warehouseId:"warehouse-a",sku:"SKU-1",minimumQuantityMilli:1000,reorderQuantityMilli:3000,maximumQuantityMilli:5000,leadTimeDays:7};
 assert.equal(ReorderPolicySchema.safeParse(policy).success,true);
 assert.equal(ReorderPolicySchema.safeParse({...policy,reorderQuantityMilli:6000}).success,false);
});

test("carrier tracking contracts require delivery evidence and exclude internal database versions",()=>{
 const event={tenantId:"tenant-a",organizationId:"org-a",shipmentId:"shipment-1",carrierId:"carrier-a",trackingNumber:"TRACK-1",providerEventId:"provider-event-1",status:"in_transit",reason:"Carrier scan received",occurredAt:"2026-11-20T10:00:00.000Z"};
 assert.equal(CarrierTrackingEventSchema.safeParse(event).success,true);
 assert.equal(CarrierTrackingEventSchema.safeParse({...event,status:"delivered"}).success,false);
 assert.equal(CarrierTrackingEventSchema.safeParse({...event,status:"delivered",proofOfDeliveryRef:"pod://shipment-1"}).success,true);
 assert.equal(CarrierTrackingEventSchema.safeParse({...event,expectedShipmentVersion:7}).success,false);
 assert.equal(CarrierTrackingEventSchema.safeParse({...event,proofOfDeliveryRef:"pod://shipment-1"}).success,false);
});
