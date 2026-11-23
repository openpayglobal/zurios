import { pathToFileURL } from "node:url";
import app from "./server.js";
import { config } from "./config.js";

const address = await app.listen({ host: config.API_HOST, port: config.API_PORT });
app.log.info({ address }, "Zuri OS API development server listening");

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
