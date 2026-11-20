import {connectMongo,closeMongo} from "../src/db/mongo.js";
import {runWebhookDeliveryWorker} from "@zuri/core-platform";
import {createEnvironmentWebhookSecretResolver} from "../src/platform/webhook-secret-resolver.js";

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
    batchSize:process.env.WEBHOOK_WORKER_BATCH_SIZE?Number(process.env.WEBHOOK_WORKER_BATCH_SIZE):20,
    pollIntervalMs:process.env.WEBHOOK_WORKER_POLL_INTERVAL_MS?Number(process.env.WEBHOOK_WORKER_POLL_INTERVAL_MS):2000,
    onError:error=>console.error("Webhook delivery worker poll failed; retrying",error)
  });
}catch(error){
  console.error("Webhook delivery worker stopped",error);
  process.exitCode=1;
}finally{
  if(connected)await closeMongo();
}
