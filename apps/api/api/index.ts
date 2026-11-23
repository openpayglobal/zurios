import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../src/server.js";

let readyPromise: Promise<void> | undefined;

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  readyPromise ??= app.ready();
  await readyPromise;
  app.server.emit("request", request, response);
}
