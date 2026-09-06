import { invalidateChallengeCaches } from "../cache.js";
import { closeRedis } from "../redis.js";
import { prisma } from "@codearena/db";

const removed = await invalidateChallengeCaches();
console.log(`flushed ${removed} challenge cache key(s)`);
await closeRedis();
await prisma.$disconnect();
