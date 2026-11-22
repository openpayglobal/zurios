import test from "node:test";
import assert from "node:assert/strict";
import * as corePlatform from "@zuri/core-platform";

test("API runtime resolves the compiled core-platform workspace package", () => {
  assert.equal(typeof corePlatform.createMongoEventBusPublisher, "function");
  assert.equal(typeof corePlatform.runOutboxWorker, "function");
  assert.equal(typeof corePlatform.createIdempotencyService, "function");
  assert.equal(typeof corePlatform.createApprovalService, "function");
});
