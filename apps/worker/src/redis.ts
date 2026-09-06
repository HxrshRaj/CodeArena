import { Redis } from "ioredis";
import { config } from "./config.js";

/** General commands + cache reads/writes. */
export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

/** Dedicated connection for blocking pops (BRPOP) so it never stalls commands. */
export const blocking = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

/** Publishing execution events to WebSocket subscribers via pub/sub. */
export const pub = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([redis.quit(), blocking.quit(), pub.quit()]);
}
