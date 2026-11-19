import {connectMongo,closeMongo} from "../src/db/mongo.js";
import {runAbacBackfill} from "../src/platform/abac-backfill-service.js";

const apply=process.env.ABAC_BACKFILL_APPLY==="true";
const db=await connectMongo();
try{
 const summary=await runAbacBackfill(db,apply,process.env.ABAC_BACKFILL_TARGET??"unspecified");
 process.stdout.write(JSON.stringify(summary)+"\n");
 if(!apply)process.stdout.write("No database writes performed. Set ABAC_BACKFILL_APPLY=true only after reviewing target, counts and policy scope.\n");
}finally{await closeMongo();}
