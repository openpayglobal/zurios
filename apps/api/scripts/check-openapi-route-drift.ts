import {readFileSync} from "node:fs";
import {PLATFORM_BODY_CONTRACTS} from "../src/platform/platform-schemas.js";

const routeSource=readFileSync("src/platform/platform-routes.ts","utf8");
const macRouteSource=readFileSync("src/platform/mac-operator-routes.ts","utf8");
const inventoryRouteSource=readFileSync("src/inventory/inventory-routes.ts","utf8");
const contract=readFileSync("../../docs/api/openapi.yaml","utf8");
const routeDefinitions=[...routeSource.matchAll(/app\.(get|post|put|patch|delete)\("([^"]+)"/g)];
const macRouteDefinitions=[...macRouteSource.matchAll(/app\.(get|post|put|patch|delete)\("([^"]+)"/g)];
const inventoryRouteDefinitions=[...inventoryRouteSource.matchAll(/app\.(get|post|put|patch|delete)\("([^"]+)"/g)];
const allRouteDefinitions=[...routeDefinitions,...macRouteDefinitions,...inventoryRouteDefinitions];
const routePaths=new Set(allRouteDefinitions.map(([, ,path])=>path.replace(/:([A-Za-z0-9_]+)/g,"{$1}")));
const pathsSection=contract.split(/^paths:\s*$/m)[1]?.split(/^components:\s*$/m)[0]??"";
const contractPaths=new Set([...pathsSection.matchAll(/^  (\/[^:]+):\s*$/gm)].map(([,path])=>path));
const missingFromContract=[...routePaths].filter(path=>!contractPaths.has(path));
const undocumentedRoutes=[...contractPaths].filter(path=>!routePaths.has(path));
const mutatingRoutes=routeDefinitions.filter(([,method])=>method!=="get").length+inventoryRouteDefinitions.filter(([,method])=>method!=="get").length;
const idempotencyRefs=(contract.match(/\$ref: "#\/components\/parameters\/IdempotencyKey"/g)??[]).length;
const failures:string[]=[];
if(!contract.startsWith("openapi: 3.1."))failures.push("OpenAPI document must use 3.1");
if(!contract.includes("url: /v1"))failures.push("OpenAPI server must target /v1");
if(missingFromContract.length)failures.push(`Routes missing from OpenAPI: ${missingFromContract.join(", ")}`);
if(undocumentedRoutes.length)failures.push(`OpenAPI paths missing from Fastify routes: ${undocumentedRoutes.join(", ")}`);
if(idempotencyRefs!==mutatingRoutes)failures.push(`Expected ${mutatingRoutes} Idempotency-Key references, found ${idempotencyRefs}`);

function componentSchemaBlock(name:string):string{
 const schemasStart=contract.indexOf("  schemas:\n");
 const start=contract.indexOf(`    ${name}:\n`,schemasStart);
 if(start<0)throw new Error(`OpenAPI schema ${name} is missing`);
 const remainder=contract.slice(start+`    ${name}:\n`.length);
 const next=remainder.search(/\n    [A-Za-z][A-Za-z0-9_]*:\n/);
 return contract.slice(start,next<0?contract.length:start+`    ${name}:\n`.length+next);
}
function sorted(values:string[]){return [...values].sort();}
function same(a:string[],b:string[]){return JSON.stringify(sorted(a))===JSON.stringify(sorted(b));}
for(const bodyContract of PLATFORM_BODY_CONTRACTS){
 const pathStart=contract.indexOf(`  ${bodyContract.path}:\n`);
 const methodStart=contract.indexOf(`    ${bodyContract.method}:\n`,pathStart);
 const nextPath=contract.indexOf("\n  /",methodStart+1);
 const operation=contract.slice(methodStart,nextPath<0?contract.length:nextPath);
 const reference=operation.match(/requestBody:[\s\S]*?schema:\s*\{\$ref:\s*["']#\/components\/schemas\/([^"']+)["']\s*\}/);
 if(!reference)failures.push(`Missing OpenAPI requestBody reference for ${bodyContract.method.toUpperCase()} ${bodyContract.path}`);
 else if(reference[1]!==bodyContract.schemaName)failures.push(`Request schema mismatch for ${bodyContract.path}: expected ${bodyContract.schemaName}, found ${reference[1]}`);
 const schemaBlock=componentSchemaBlock(bodyContract.schemaName);
 const propertiesSection=schemaBlock.split("      properties:\n")[1]??"";
 const properties=[...propertiesSection.matchAll(/^        ([A-Za-z0-9_]+):/gm)].map(([,name])=>name);
 const requiredMatch=schemaBlock.match(/^      required:\s*\[([^\]]*)\]/m);
 const required=(requiredMatch?.[1]??"").split(",").map(value=>value.trim()).filter(Boolean);
 const zodShape=bodyContract.schema.shape as Record<string,{isOptional:()=>boolean}>;
 const zodFields=Object.keys(zodShape);
 const zodRequired=zodFields.filter(name=>!zodShape[name].isOptional());
 if(!same(zodFields,properties))failures.push(`Property drift in ${bodyContract.schemaName}: Zod=[${zodFields.join(",")}], OpenAPI=[${properties.join(",")}]`);
 if(!same(zodRequired,required))failures.push(`Required-field drift in ${bodyContract.schemaName}: Zod=[${zodRequired.join(",")}], OpenAPI=[${required.join(",")}]`);
}
if(failures.length){for(const failure of failures)process.stderr.write(`ERROR: ${failure}\n`);process.exitCode=1;}
else process.stdout.write(`OpenAPI contract drift check passed: ${routePaths.size} paths, ${mutatingRoutes} idempotent mutations and ${PLATFORM_BODY_CONTRACTS.length} shared Zod request schemas.\n`);
