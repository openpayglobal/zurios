import {readFileSync} from "node:fs";
const routeSource=readFileSync("src/platform/platform-routes.ts","utf8");
const contract=readFileSync("../../docs/api/openapi.yaml","utf8");
const routeDefinitions=[...routeSource.matchAll(/app\.(get|post|put|patch|delete)\("([^"]+)"/g)];
const routePaths=new Set(routeDefinitions.map(([, ,path])=>path.replace(/:([A-Za-z0-9_]+)/g,"{$1}")));
const pathsSection=contract.split(/^paths:\s*$/m)[1]?.split(/^components:\s*$/m)[0]??"";
const contractPaths=new Set([...pathsSection.matchAll(/^  (\/[^:]+):\s*$/gm)].map(([,path])=>path));
const missingFromContract=[...routePaths].filter(path=>!contractPaths.has(path));
const undocumentedRoutes=[...contractPaths].filter(path=>!routePaths.has(path));
const mutatingRoutes=routeDefinitions.filter(([,method])=>method!=="get").length;
const idempotencyRefs=(contract.match(/\$ref: "#\/components\/parameters\/IdempotencyKey"/g)??[]).length;
const failures:string[]=[];
if(!contract.startsWith("openapi: 3.1."))failures.push("OpenAPI document must use 3.1");
if(!contract.includes("url: /v1"))failures.push("OpenAPI server must target /v1");
if(missingFromContract.length)failures.push(`Routes missing from OpenAPI: ${missingFromContract.join(", ")}`);
if(undocumentedRoutes.length)failures.push(`OpenAPI paths missing from Fastify routes: ${undocumentedRoutes.join(", ")}`);
if(idempotencyRefs!==mutatingRoutes)failures.push(`Expected ${mutatingRoutes} Idempotency-Key references, found ${idempotencyRefs}`);
if(failures.length){for(const failure of failures)process.stderr.write(`ERROR: ${failure}\n`);process.exitCode=1;}
else process.stdout.write(`OpenAPI route drift check passed: ${routePaths.size} paths, ${mutatingRoutes} idempotent mutations.\n`);
