import {connectMongo,closeMongo} from "../src/db/mongo.js";
import {runWebhookDeliveryWorker} from "@zuri/core-platform";
import {createEnvironmentWebhookSecretResolver} from "../src/platform/webhook-secret-resolver.js";

function positiveInteger(name:string,fallback:number,min:number,max:number){
  const raw=process.env[name];
  if(raw===undefined||raw==="")return fallback;
  if(!/^\d+$/.test(raw))throw new Error(name+"_MUST_BE_A_POSITIVE_INTEGER");
  const value=Number(raw);
  if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(name+"_OUT_OF_RANGE");
  return value;
}

const abortController=new AbortController();
const shutdown=()=>abortController.abort();
process.once("SIGINT",shutdown);
process.once("SIGTERM",shutdown);

let connected=false;
try{
  const db=await connectMongo();
  connected=true;
  await runWebhookDeliveryWorker(db,{resolveSecret:createEnvironmentWebhookSecretResolver()},abortController.signal,{
    workerId:process.env.WEBHOOK_WORKER_ID,
    batchSize:positiveInteger("WEBHOOK_WORKER_BATCH_SIZE",20,1,100),
    pollIntervalMs:positiveInteger("WEBHOOK_WORKER_POLL_INTERVAL_MS",2000,250,60000),
    onError:error=>console.error("Webhook delivery worker poll failed; retrying",error)
  });
}catch(error){
  console.error("Webhook delivery worker stopped",error);
  process.exitCode=1;
}finally{
  if(connected)await closeMongo();
}
