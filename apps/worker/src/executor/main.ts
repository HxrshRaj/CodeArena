/**
 * Executor worker. Blocks on the Redis queue `exec:queue`, runs each
 * submission in a sandbox (up to EXECUTOR_CONCURRENCY at once), and streams
 * results out via Redis pub/sub.
 */
import { prisma } from "@codearena/db";
import { redisKeys } from "@codearena/shared";
import { config } from "../config.js";
import { blocking, closeRedis } from "../redis.js";
import { createLogger } from "../logger.js";
import { executeSubmission } from "./execute.js";

const log = createLogger("executor:main");

let running = 0;
let stopping = false;
const inFlight = new Set<Promise<void>>();

async function loop(): Promise<void> {
  log.info("executor started", {
    queue: redisKeys.execQueue,
    concurrency: config.EXECUTOR_CONCURRENCY,
    image: config.SANDBOX_IMAGE,
  });

  while (!stopping) {
    if (running >= config.EXECUTOR_CONCURRENCY) {
      await Promise.race(inFlight);
      continue;
    }

    // BRPOP blocks up to 5s, then loops so we can observe `stopping`.
    const popped = await blocking.brpop(redisKeys.execQueue, 5);
    if (!popped) continue;
    const submissionId = popped[1];

    running += 1;
    const task = executeSubmission(submissionId)
      .catch((err) => log.error("execution threw", { submissionId, err: String(err) }))
      .finally(() => {
        running -= 1;
        inFlight.delete(task);
      });
    inFlight.add(task);
  }

  await Promise.allSettled(inFlight);
}

async function shutdown(signal: string): Promise<void> {
  log.info("shutting down", { signal, inFlight: inFlight.size });
  stopping = true;
  await Promise.allSettled(inFlight);
  await closeRedis();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

loop().catch((err) => {
  log.error("executor loop crashed", { err: String(err) });
  process.exit(1);
});
