import {
  RedisClient,
  getHubClient,
  EventStreamConnection,
  EventStreamHubSubscriber,
} from "@farcaster/shuttle";
import { Queue } from "bullmq";
import { HUB_HOST, HUB_SSL, REDIS_URL } from "./env";
import { log } from "./log";
import { getWorker } from "./worker";

const hubId = "shuttle";

const hub = getHubClient(HUB_HOST, { ssl: HUB_SSL });
const redis = RedisClient.create(REDIS_URL);
const eventStreamForWrite = new EventStreamConnection(redis.client);
const hubSubscriber = new EventStreamHubSubscriber(
  hubId,
  hub,
  eventStreamForWrite,
  redis,
  "all",
  log
);

log.info(`Connected to ${hub.host}`);

log.info(`Backfilling fids...`);
backfillFids();

log.info(`Starting worker...`);
const worker = getWorker(hub, redis, log);
await worker.run();

async function backfillFids() {
  const startedAt = Date.now();

  const backfillQueue = new Queue("default", {
    connection: redis.client,
    defaultJobOptions: {
      attempts: 3,
      backoff: { delay: 1000, type: "exponential" },
    },
  });

  if (!hubSubscriber.hubClient) {
    log.error("Hub client is not initialized");
    throw new Error("Hub client is not initialized");
  }

  const maxFidResult = await hubSubscriber.hubClient.getFids({
    pageSize: 1,
    reverse: true,
  });

  if (maxFidResult.isErr()) {
    log.error("Failed to get max fid", maxFidResult.error);
    throw maxFidResult.error;
  }

  const maxFid = maxFidResult?.value.fids[0];

  if (!maxFid) {
    log.error("Max fid was undefined");
    throw new Error("Max fid was undefined");
  }

  log.info(`Queuing up fids up to: ${maxFid}`);

  // create an array of arrays in batches of 10 upto maxFid
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
  log.info("Backfill jobs queued");
}

// console.log(`Starting stream...`);
// await this.hubSubscriber.start();

// // TODO: There has to be a better way to do this
// // Sleep 10 seconds to give the subscriber a chance to create the stream for the first time.
// await new Promise((resolve) => setTimeout(resolve, 10_000));

// // Stream consumer reads from the redis stream and inserts them into postgres
// await this.streamConsumer.start(async (event) => {
//   HubEventProcessor.processHubEvent(this.db, event, this);
//   return ok({ skipped: false });
// });
