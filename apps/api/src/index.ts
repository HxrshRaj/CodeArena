import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { challengeRoutes } from "./routes/challenges.js";
import { submissionRoutes } from "./routes/submissions.js";
import { attachWebSocket } from "./ws.js";
import { closeRedis, redis } from "./redis.js";
import { prisma } from "@codearena/db";
import { createLogger } from "./logger.js";

const log = createLogger("api");

async function main(): Promise<void> {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: config.WEB_ORIGIN.split(",").map((s) => s.trim()),
  });

  app.get("/health", async () => {
    const [dbOk, redisOk] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      redis.ping().then((r: string) => r === "PONG").catch(() => false),
    ]);
    return { ok: dbOk && redisOk, db: dbOk, redis: redisOk };
  });

  await app.register(challengeRoutes);
  await app.register(submissionRoutes);

  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  attachWebSocket(app.server);
  log.info("api listening", { port: config.API_PORT });

  const shutdown = async (): Promise<void> => {
    log.info("shutting down");
    await app.close();
    await closeRedis();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log.error("failed to start", { err: String(err) });
  process.exit(1);
});
