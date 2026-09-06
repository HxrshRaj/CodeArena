import { Redis } from "ioredis";
import { config } from "./config.js";

/** Command connection: GET/SET/LPUSH/SADD/HSET ... */
export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

/** Dedicated publish connection (a connection in subscribe mode can't publish). */
export const pub = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

/** Each WebSocket connection gets its own subscriber via this. */
export function createSubscriber(): Redis {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([redis.quit(), pub.quit()]);
}
