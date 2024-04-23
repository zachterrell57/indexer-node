"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/app.ts
var app_exports = {};
__export(app_exports, {
  log: () => log
});
module.exports = __toCommonJS(app_exports);
var import_shuttle = require("@farcaster/shuttle");
var import_bullmq = require("bullmq");

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
var import_pino = require("pino");
var hubId = "shuttle";
var log = (0, import_pino.pino)({
  level: "info",
  transport: {
    target: "pino-pretty",
    options: {
      singleLine: true
    }
  }
});
var hub = (0, import_shuttle.getHubClient)(HUB_HOST, { ssl: HUB_SSL });
var redis = import_shuttle.RedisClient.create(REDIS_URL);
var eventStreamForWrite = new import_shuttle.EventStreamConnection(redis.client);
var hubSubscriber = new import_shuttle.EventStreamHubSubscriber(
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
  const backfillQueue = new import_bullmq.Queue("default", {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  log
});
