// src/app.ts
import {
  RedisClient,
  getHubClient,
  EventStreamConnection,
  EventStreamHubSubscriber
} from "@farcaster/shuttle";
import { Queue } from "bullmq";

// src/env.ts
var COLORIZE = process.env["COLORIZE"] === "true" ? true : process.env["COLORIZE"] === "false" ? false : process.stdout.isTTY;
var LOG_LEVEL = process.env["LOG_LEVEL"] || "info";
var HUB_HOST = process.env["HUB_HOST"] || "localhost:2283";
var HUB_SSL = process.env["HUB_SSL"] === "true" ? true : false;
var POSTGRES_URL = process.env["POSTGRES_URL"] || "postgres://localhost:5432";
var REDIS_URL = process.env["REDIS_URL"] || "redis://localhost:6379";
var BACKFILL_FIDS = process.env["FIDS"] || "";
var MAX_FID = process.env["MAX_FID"];
var STATSD_HOST = process.env["STATSD_HOST"];
var STATSD_METRICS_PREFIX = process.env["STATSD_METRICS_PREFIX"] || "shuttle.";
var CONCURRENCY = parseInt(process.env["CONCURRENCY"] || "2");

// src/app.ts
import { pino } from "pino";
var hubId = "shuttle";
var log = pino({
  level: "info",
  transport: {
    target: "pino-pretty",
    options: {
      singleLine: true
    }
  }
});
var hub = getHubClient(HUB_HOST, { ssl: HUB_SSL });
var redis = RedisClient.create(REDIS_URL);
var eventStreamForWrite = new EventStreamConnection(redis.client);
var hubSubscriber = new EventStreamHubSubscriber(
  hubId,
  hub,
  eventStreamForWrite,
  redis,
  "all",
  log
);
console.log("Backfilling fids...");
backfillFids();
async function backfillFids() {
  const startedAt = Date.now();
  const backfillQueue = new Queue("default", {
    connection: redis.client,
    defaultJobOptions: {
      attempts: 3,
      backoff: { delay: 1e3, type: "exponential" }
    }
  });
  if (!hubSubscriber.hubClient) {
    console.log("Hub client is not initialized");
    throw new Error("Hub client is not initialized");
  }
  const maxFidResult = await hubSubscriber.hubClient.getFids({
    pageSize: 1,
    reverse: true
  });
  if (maxFidResult.isErr()) {
    console.log("Failed to get max fid", maxFidResult.error);
    throw maxFidResult.error;
  }
  const maxFid = maxFidResult == null ? void 0 : maxFidResult.value.fids[0];
  if (!maxFid) {
    console.log("Max fid was undefined");
    throw new Error("Max fid was undefined");
  }
  console.log("Queuing up fids upto: ".concat(maxFid));
  const batchSize = 10;
  const fids = Array.from(
    { length: Math.ceil(maxFid / batchSize) },
    (_, i) => i * batchSize
  ).map((fid) => fid + 1);
  for (const start of fids) {
    const subset = Array.from({ length: batchSize }, (_, i) => start + i);
    await backfillQueue.add("reconcile", { fids: subset });
  }
  await backfillQueue.add("completionMarker", { startedAt });
  console.log("Backfill jobs queued");
}
export {
  log
};
