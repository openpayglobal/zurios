import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../dist/server.js";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const incomingUrl = request.url ?? "/";
  request.url = incomingUrl.replace(/^\/api(?=\/|$)/, "") || "/";
  await app.ready();
  app.server.emit("request", request, response);
}
