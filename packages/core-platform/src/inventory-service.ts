import {Decimal128,type ClientSession,type Db} from "mongodb";
import {z} from "zod";
import {newId} from "./ids.js";

const quantitySchema=z.string().regex(/^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,6})?$/).refine(v=>/[1-9]/.test(v),"Quantity must be greater than zero");
const productSchema=z.object({
 sku:z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._/-]+$/),
 name:z.string().trim().min(2).max(200),
 baseUnitCode:z.string().trim().min(1).max(12).transform(v=>v.toUpperCase()),
 categoryId:z.string().optional(),
 trackLot:z.boolean().default(false),
 trackSerial:z.literal(false).default(false),
 allowNegativeStock:z.boolean().default(false)
});
const locationSchema=z.object({
 organizationId:z.string().min(1),
 code:z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/),
 name:z.string().trim().min(2).max(150),
 type:z.enum(["warehouse","store","stockroom","transit","other"]).default("warehouse")
});
const movementSchema=z.object({
 productId:z.string().min(1),
 stockLocationId:z.string().min(1),
 destinationStockLocationId:z.string().min(1).optional(),
 movementType:z.enum(["receipt","issue","adjustment_in","adjustment_out","transfer"]),
 quantity:quantitySchema,
 unitCode:z.string().trim().min(1).max(12).transform(v=>v.toUpperCase()),
 lotId:z.string().min(1).optional(),
 source:z.object({type:z.string().min(2).max(80),id:z.string().min(1).max(128)}),
 idempotencyKey:z.string().min(8).max(128),
 reason:z.string().trim().min(5).max(300).optional(),
 occurredAt:z.coerce.date().optional()
}).superRefine((v,ctx)=>{
 if(v.movementType==="transfer"&&!v.destinationStockLocationId)ctx.addIssue({code:"custom",path:["destinationStockLocationId"],message:"Destination stock location is required for transfers"});
 if(v.movementType!=="transfer"&&v.destinationStockLocationId)ctx.addIssue({code:"custom",path:["destinationStockLocationId"],message:"Destination is only valid for transfers"});
 if(v.movementType.startsWith("adjustment_")&&!v.reason)ctx.addIssue({code:"custom",path:["reason"],message:"Adjustment reason is required"});
 if(v.movementType==="transfer"&&v.stockLocationId===v.destinationStockLocationId)ctx.addIssue({code:"custom",path:["destinationStockLocationId"],message:"Transfer locations must differ"});
});

type StockProduct={tenantId:string;productId:string;sku:string;skuNormalized:string;name:string;baseUnitCode:string;categoryId?:string;trackLot:boolean;trackSerial:boolean;allowNegativeStock:boolean;status:"active"|"inactive";createdAt:Date;updatedAt:Date;createdBy:string;updatedBy:string};
type StockLocation={tenantId:string;stockLocationId:string;organizationId:string;code:string;name:string;type:string;status:"active"|"inactive";createdAt:Date;updatedAt:Date;createdBy:string;updatedBy:string};
type StockBalance={tenantId:string;productId:string;stockLocationId:string;lotId?:string;quantityOnHand:Decimal128;quantityReserved:Decimal128;quantityInTransit:Decimal128;updatedAt:Date;updatedBy:string};
function decimal(value:string){return Decimal128.fromString(value);}
function balanceFilter(tenantId:string,productId:string,stockLocationId:string,lotId?:string){return {tenantId,productId,stockLocationId,...(lotId?{lotId}:{lotId:{$exists:false}})};}
async function applyDelta(db:Db,input:{tenantId:string;productId:string;stockLocationId:string;lotId?:string;quantity:string;direction:1|-1;allowNegative:boolean;actorId:string;session:ClientSession}){
 const balances=db.collection<StockBalance>("stock_balances"),filter=balanceFilter(input.tenantId,input.productId,input.stockLocationId,input.lotId),now=new Date();
 const amount=decimal(input.quantity),delta=input.direction===1?amount:decimal("-"+input.quantity);
 const update={$inc:{quantityOnHand:delta},$set:{updatedAt:now,updatedBy:input.actorId},$setOnInsert:{tenantId:input.tenantId,productId:input.productId,stockLocationId:input.stockLocationId,...(input.lotId?{lotId:input.lotId}:{}),quantityReserved:decimal("0"),quantityInTransit:decimal("0"),createdAt:now,createdBy:input.actorId}};
 if(input.direction===1||input.allowNegative){
  await balances.updateOne(filter,update,{upsert:true,session:input.session});
 }else{
  const result=await balances.updateOne({...filter,quantityOnHand:{$gte:amount}},update,{session:input.session});
  if(!result.matchedCount)throw new Error("INSUFFICIENT_STOCK");
 }
 const balance=await balances.findOne(filter,{session:input.session});
 if(!balance)throw new Error("STOCK_BALANCE_MISSING");
 return balance;
}
function movementDocument(input:{tenantId:string;movementId:string;productId:string;stockLocationId:string;movementType:string;quantity:string;unitCode:string;lotId?:string;source:{type:string;id:string};idempotencyKey:string;occurredAt:Date;actorId:string;transferId?:string;reason?:string}){
 return {tenantId:input.tenantId,movementId:input.movementId,productId:input.productId,stockLocationId:input.stockLocationId,movementType:input.movementType,quantity:decimal(input.quantity),unitCode:input.unitCode,...(input.lotId?{lotId:input.lotId}:{}),source:input.source,idempotencyKey:input.idempotencyKey,occurredAt:input.occurredAt,actor:{type:"user",id:input.actorId},...(input.transferId?{transferId:input.transferId}:{}),...(input.reason?{reason:input.reason}:{}),schemaVersion:1,createdAt:new Date()};
}
export async function createInventoryProduct(db:Db,tenantId:string,actorId:string,input:unknown,session:ClientSession){
 const data=productSchema.parse(input),{categoryId,...productFields}=data,now=new Date(),productId=newId("prd"),doc:StockProduct={tenantId,productId,...productFields,...(categoryId?{categoryId}:{}),skuNormalized:data.sku.trim().toUpperCase(),status:"active",createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId};
 await db.collection<StockProduct>("products").insertOne(doc,{session});return doc;
}
export async function createStockLocation(db:Db,tenantId:string,actorId:string,input:unknown,session:ClientSession){
 const data=locationSchema.parse(input),organization=await db.collection("organizations").findOne({tenantId,organizationId:data.organizationId,status:"active"},{session});
 if(!organization)throw new Error("ORGANIZATION_NOT_FOUND");
 const now=new Date(),stockLocationId=newId("stloc"),doc:StockLocation={tenantId,stockLocationId,...data,status:"active",createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId};
 await db.collection<StockLocation>("stock_locations").insertOne(doc,{session});return doc;
}
const lotSchema=z.object({productId:z.string().min(1),lotNumber:z.string().trim().min(1).max(100),supplierLotNumber:z.string().trim().max(100).optional(),expiryDate:z.coerce.date().optional(),receivedAt:z.coerce.date().optional()});
export async function createStockLot(db:Db,tenantId:string,actorId:string,input:unknown,session:ClientSession){
 const data=lotSchema.parse(input),product=await db.collection<StockProduct>("products").findOne({tenantId,productId:data.productId,status:"active"},{session});
 if(!product)throw new Error("PRODUCT_NOT_FOUND");
 if(!product.trackLot)throw new Error("PRODUCT_NOT_LOT_TRACKED");
 if(data.expiryDate&&data.expiryDate<=new Date())throw new Error("LOT_EXPIRY_INVALID");
 const now=new Date(),doc={tenantId,lotId:newId("lot"),...data,status:"active" as const,createdAt:now,updatedAt:now,createdBy:actorId,updatedBy:actorId};
 await db.collection("stock_lots").insertOne(doc,{session});return doc;
}
export async function recordStockMovement(db:Db,tenantId:string,actorId:string,input:unknown,session:ClientSession){
 const data=movementSchema.parse(input),products=db.collection<StockProduct>("products"),locations=db.collection<StockLocation>("stock_locations");
 const product=await products.findOne({tenantId,productId:data.productId,status:"active"},{session});
 if(!product)throw new Error("PRODUCT_NOT_FOUND");
 if(data.unitCode!==product.baseUnitCode)throw new Error("UNIT_MISMATCH");
 if(product.trackLot&&!data.lotId)throw new Error("LOT_REQUIRED");
 if(product.trackSerial)throw new Error("SERIAL_TRACKING_NOT_IMPLEMENTED");
 if(data.lotId&&!await db.collection("stock_lots").findOne({tenantId,lotId:data.lotId,productId:data.productId,status:"active"},{session}))throw new Error("STOCK_LOT_NOT_FOUND");
 const source=await locations.findOne({tenantId,stockLocationId:data.stockLocationId,status:"active"},{session});
 if(!source)throw new Error("STOCK_LOCATION_NOT_FOUND");
 if(data.movementType==="transfer"){
  const destinationId=data.destinationStockLocationId;
  if(!destinationId)throw new Error("DESTINATION_STOCK_LOCATION_REQUIRED");
  const destination=await locations.findOne({tenantId,stockLocationId:destinationId,status:"active"},{session});
  if(!destination)throw new Error("DESTINATION_STOCK_LOCATION_NOT_FOUND");
 }
 const movements=db.collection("stock_movements"),now=data.occurredAt??new Date();
 const exists=await movements.findOne({tenantId,idempotencyKey:data.movementType==="transfer"?{$in:[data.idempotencyKey,data.idempotencyKey+":out",data.idempotencyKey+":in"]}:data.idempotencyKey},{session});
 if(exists)throw new Error("STOCK_MOVEMENT_ALREADY_RECORDED");
 const transferId=data.movementType==="transfer"?newId("str"):undefined;
 const movementDocs=[];
 if(data.movementType==="transfer"){
  await applyDelta(db,{tenantId,productId:data.productId,stockLocationId:data.stockLocationId,...(data.lotId?{lotId:data.lotId}:{}),quantity:data.quantity,direction:-1,allowNegative:product.allowNegativeStock,actorId,session});
  await applyDelta(db,{tenantId,productId:data.productId,stockLocationId:data.destinationStockLocationId!,...(data.lotId?{lotId:data.lotId}:{}),quantity:data.quantity,direction:1,allowNegative:true,actorId,session});
  movementDocs.push(movementDocument({tenantId,movementId:newId("mov"),productId:data.productId,stockLocationId:data.stockLocationId,movementType:"transfer_out",quantity:data.quantity,unitCode:data.unitCode,...(data.lotId?{lotId:data.lotId}:{}),source:data.source,idempotencyKey:data.idempotencyKey+":out",occurredAt:now,actorId,transferId:transferId!,...(data.reason?{reason:data.reason}:{})}));
  movementDocs.push(movementDocument({tenantId,movementId:newId("mov"),productId:data.productId,stockLocationId:data.destinationStockLocationId!,movementType:"transfer_in",quantity:data.quantity,unitCode:data.unitCode,...(data.lotId?{lotId:data.lotId}:{}),source:data.source,idempotencyKey:data.idempotencyKey+":in",occurredAt:now,actorId,transferId,...(data.reason?{reason:data.reason}:{})}));
  await db.collection("stock_transfer_orders").insertOne({tenantId,transferId,productId:data.productId,sourceStockLocationId:data.stockLocationId,destinationStockLocationId:data.destinationStockLocationId,quantity:decimal(data.quantity),unitCode:data.unitCode,lotId:data.lotId,source:data.source,status:"completed",createdAt:new Date(),createdBy:actorId},{session});
 }else{
  const direction=data.movementType==="receipt"||data.movementType==="adjustment_in"?1:-1;
  await applyDelta(db,{tenantId,productId:data.productId,stockLocationId:data.stockLocationId,...(data.lotId?{lotId:data.lotId}:{}),quantity:data.quantity,direction,allowNegative:product.allowNegativeStock,actorId,session});
  movementDocs.push(movementDocument({tenantId,movementId:newId("mov"),productId:data.productId,stockLocationId:data.stockLocationId,movementType:data.movementType,quantity:data.quantity,unitCode:data.unitCode,...(data.lotId?{lotId:data.lotId}:{}),source:data.source,idempotencyKey:data.idempotencyKey,occurredAt:now,actorId,...(data.reason?{reason:data.reason}:{})}));
 }
 await movements.insertMany(movementDocs,{session});
 return {transferId,movements:movementDocs};
}
export async function getStockBalance(db:Db,tenantId:string,productId:string,stockLocationId:string,lotId?:string){
 const balance=await db.collection<StockBalance>("stock_balances").findOne(balanceFilter(tenantId,productId,stockLocationId,lotId));
 return {tenantId,productId,stockLocationId,...(lotId?{lotId}:{}),quantityOnHand:balance?.quantityOnHand.toString()??"0",quantityReserved:balance?.quantityReserved.toString()??"0",quantityInTransit:balance?.quantityInTransit.toString()??"0",quantityAvailable:balance?.quantityOnHand.toString()??"0",updatedAt:balance?.updatedAt??null};
}
