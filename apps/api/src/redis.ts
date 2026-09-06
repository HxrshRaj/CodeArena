import { Redis } from "ioredis";
import { config } from "./config.js";
import { createLogger } from "./logger.js";

const log = createLogger("redis");

/** Command connection: GET/SET/LPUSH/SADD/HSET ... */
export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
redis.on("error", (err: Error) => log.error("command connection error", { err: err.message }));

/** Dedicated publish connection (a connection in subscribe mode can't publish). */
export const pub = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
pub.on("error", (err: Error) => log.error("publish connection error", { err: err.message }));

/**
 * Subscriber connection. `enableReadyCheck: false` avoids ioredis issuing
 * INFO during a reconnect while the connection is already in subscriber mode
 * ("only subscriber commands may be used").
 */
export function createSubscriber(): Redis {
  const sub = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  sub.on("error", (err: Error) => log.error("subscriber connection error", { err: err.message }));
  return sub;
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([redis.quit(), pub.quit()]);
}
