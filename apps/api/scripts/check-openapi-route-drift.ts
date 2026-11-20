import {readFileSync} from "node:fs";
import {PLATFORM_BODY_CONTRACTS} from "../src/platform/platform-schemas.js";
import {ADMIN_BODY_CONTRACTS} from "../src/platform/admin-schemas.js";

const routeSource=readFileSync("src/platform/platform-routes.ts","utf8")+"\\n"+readFileSync("src/platform/admin-routes.ts","utf8")+"\\n"+readFileSync("src/platform/domain-routes.ts","utf8");
const contract=readFileSync("../../docs/api/openapi.yaml","utf8");
const routeDefinitions=[...routeSource.matchAll(/app\.(get|post|put|patch|delete)\("([^"]+)"/g)];
const routePaths=new Set(routeDefinitions.map(([, ,path])=>path.replace(/:([A-Za-z0-9_]+)/g,"{$1}")));
const pathsSection=contract.split(/^paths:\s*$/m)[1]?.split(/^components:\s*$/m)[0]??"";
const contractPaths=new Set([...pathsSection.matchAll(/^  (\/[^:]+):\s*$/gm)].map(([,path])=>path).filter(path=>path.startsWith("/platform/")||path.startsWith("/inventory/")||path.startsWith("/pos/")||path.startsWith("/erp/")||path.startsWith("/crm/")||path.startsWith("/hr/")||path.startsWith("/payroll/")||path.startsWith("/payments/")||path.startsWith("/commerce/")||(path==="/assets"||path.startsWith("/assets/"))||(path==="/projects"||path.startsWith("/projects/"))||(path==="/workflows"||path.startsWith("/workflows/"))||path==="/workflow-runs"||path==="/workflow-tasks"||path.startsWith("/workflow-tasks/")));
const missingFromContract=[...routePaths].filter(path=>!contractPaths.has(path));
const undocumentedRoutes=[...contractPaths].filter(path=>!routePaths.has(path));
const mutatingRoutes=routeDefinitions.filter(([,method,path])=>method!=="get"&&!(method==="post"&&path.endsWith("/simulate"))).length;
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
const allBodyContracts=[...PLATFORM_BODY_CONTRACTS,...ADMIN_BODY_CONTRACTS];
for(const bodyContract of allBodyContracts){
 const pathStart=contract.indexOf(`  ${bodyContract.path}:\n`);
 const methodStart=contract.indexOf(`    ${bodyContract.method}:\n`,pathStart);
 const nextPath=contract.indexOf("\n  /",methodStart+1);
 const operation=contract.slice(methodStart,nextPath<0?contract.length:nextPath);
 const reference=operation.match(/requestBody:[\s\S]*?schema:\s*\{\$ref:\s*["']#\/components\/schemas\/([^"']+)["']\s*\}/);
 if(!reference)failures.push(`Missing OpenAPI requestBody reference for ${bodyContract.method.toUpperCase()} ${bodyContract.path}`);
 else if(reference[1]!==bodyContract.schemaName)failures.push(`Request schema mismatch for ${bodyContract.path}: expected ${bodyContract.schemaName}, found ${reference[1]}`);
 const schemaBlock=componentSchemaBlock(bodyContract.schemaName);
 // Match only direct children of the schema's properties map. Parsing the entire
 // schema block avoids truncating fields after nested object properties.
 const properties=[...schemaBlock.matchAll(/^ {8}([A-Za-z0-9_]+):/gm)].map(([,name])=>name);
 const requiredMatch=schemaBlock.match(/^      required:\s*\[([^\]]*)\]/m);
 const required=(requiredMatch?.[1]??"").split(",").map(value=>value.trim()).filter(Boolean);
 const zodShape=bodyContract.schema.shape as Record<string,{isOptional:()=>boolean}>;
 const zodFields=Object.keys(zodShape);
 const zodRequired=zodFields.filter(name=>!zodShape[name].isOptional());
 if(!same(zodFields,properties))failures.push(`Property drift in ${bodyContract.schemaName}: Zod=[${zodFields.join(",")}], OpenAPI=[${properties.join(",")}]`);
 if(!same(zodRequired,required))failures.push(`Required-field drift in ${bodyContract.schemaName}: Zod=[${zodRequired.join(",")}], OpenAPI=[${required.join(",")}]`);
}
if(failures.length){for(const failure of failures)process.stderr.write(`ERROR: ${failure}\n`);process.exitCode=1;}
else process.stdout.write(`OpenAPI contract drift check passed: ${routePaths.size} paths, ${mutatingRoutes} idempotent mutations and ${allBodyContracts.length} shared Zod request schemas.\n`);
