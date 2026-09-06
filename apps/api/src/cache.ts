/**
 * Cache-aside for challenge data. Challenges change rarely (seed script only)
 * and are read on every catalogue view and every submission, so this is a
 * real hit-rate win, not decoration.
 *
 *   read:  GET key -> hit? parse & return : load from Postgres, SET EX, return
 *
 * There is no runtime write path for challenges, so invalidation is just the
 * 1h TTL. After re-running the seed in dev, call `invalidateChallengeCaches()`
 * (exposed via `npm run cache:flush -w @codearena/api`) or let the TTL lapse.
 */
import {
  CHALLENGE_CACHE_TTL_SECONDS,
  redisKeys,
  type ChallengeDetail,
  type ChallengeSummary,
} from "@codearena/shared";
import { prisma } from "@codearena/db";
import { redis } from "./redis.js";
import { toChallengeDetail, toChallengeSummary } from "./mappers.js";
import { createLogger } from "./logger.js";

const log = createLogger("cache");

export async function getChallengeIndex(): Promise<ChallengeSummary[]> {
  const cached = await redis.get(redisKeys.challengeIndexCache);
  if (cached) {
    log.info("challenge index cache hit");
    return JSON.parse(cached) as ChallengeSummary[];
  }
  const rows = await prisma.challenge.findMany({ orderBy: { createdAt: "asc" } });
  const dto = rows.map(toChallengeSummary);
  await redis.set(
    redisKeys.challengeIndexCache,
    JSON.stringify(dto),
    "EX",
    CHALLENGE_CACHE_TTL_SECONDS,
  );
  log.info("challenge index cache miss -> filled", { count: dto.length });
  return dto;
}

export async function getChallengeDetail(id: string): Promise<ChallengeDetail | null> {
  const key = redisKeys.challengeCache(id);
  const cached = await redis.get(key);
  if (cached) {
    log.info("challenge detail cache hit", { id });
    return JSON.parse(cached) as ChallengeDetail;
  }
  const row = await prisma.challenge.findUnique({
    where: { id },
    include: { testCases: true },
  });
  if (!row) return null;
  const dto = toChallengeDetail(row);
  await redis.set(key, JSON.stringify(dto), "EX", CHALLENGE_CACHE_TTL_SECONDS);
  log.info("challenge detail cache miss -> filled", { id });
  return dto;
}

/** Also resolves a slug, so the web app can use friendly URLs. */
export async function resolveChallengeId(idOrSlug: string): Promise<string | null> {
  const index = await getChallengeIndex();
  const match = index.find((c) => c.id === idOrSlug || c.slug === idOrSlug);
  return match?.id ?? null;
}

/** Drop every cached challenge entry. For use after re-seeding in dev. */
export async function invalidateChallengeCaches(): Promise<number> {
  const ids = await prisma.challenge.findMany({ select: { id: true } });
  const keys = [
    redisKeys.challengeIndexCache,
    ...ids.flatMap((c) => [redisKeys.challengeCache(c.id), redisKeys.challengeExecCache(c.id)]),
  ];
  return redis.del(...keys);
}
