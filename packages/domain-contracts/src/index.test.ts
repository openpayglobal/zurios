import test from "node:test";
import assert from "node:assert/strict";
import {JournalEntrySchema,PosSaleSchema,StockMovementSchema,DomainEventEnvelopeSchema} from "./index.js";

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
 assert.equal(StockMovementSchema.safeParse({...movement,reason:"Cycle count variance"}).success,true);
});

test("Domain events carry tenant, version, correlation and idempotency identity",()=>{
 const event={eventId:"evt-1",tenantId:"tenant-a",eventType:"inventory.stock.received",schemaVersion:1,occurredAt:"2026-11-19T08:00:00.000Z",correlationId:"corr-1",idempotencyKey:"stock-receipt-0001",payload:{sku:"SKU-1",quantityMilli:1000}};
 assert.equal(DomainEventEnvelopeSchema.safeParse(event).success,true);
 assert.equal(DomainEventEnvelopeSchema.safeParse({...event,idempotencyKey:"short"}).success,false);
});
