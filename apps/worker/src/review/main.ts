/**
 * Review worker. Separate process from the executor on purpose: LLM latency
 * and failures must not sit anywhere near the deterministic execution path.
 */
import { prisma } from "@codearena/db";
import { redisKeys } from "@codearena/shared";
import { config } from "../config.js";
import { blocking, closeRedis } from "../redis.js";
import { createLogger } from "../logger.js";
import { reviewSubmission } from "./review.js";

const log = createLogger("review:main");

let stopping = false;

async function loop(): Promise<void> {
  log.info("review worker started", { queue: redisKeys.reviewQueue, provider: config.LLM_PROVIDER });

  while (!stopping) {
    const popped = await blocking.brpop(redisKeys.reviewQueue, 5);
    if (!popped) continue;
    const submissionId = popped[1];
    try {
      await reviewSubmission(submissionId);
    } catch (err) {
      log.error("review threw", { submissionId, err: String(err) });
    }
  }
}

async function shutdown(signal: string): Promise<void> {
  log.info("shutting down", { signal });
  stopping = true;
  await closeRedis();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

loop().catch((err) => {
  log.error("review loop crashed", { err: String(err) });
  process.exit(1);
});
