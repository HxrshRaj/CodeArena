/**
 * Cache-aside for the *full* challenge (every test case's stdin/expected).
 * Separate Redis key from the API's public projection so hidden expected
 * output never shares a cache entry with client-facing data.
 */
import { CHALLENGE_CACHE_TTL_SECONDS, redisKeys } from "@codearena/shared";
import { prisma } from "@codearena/db";
import { redis } from "../redis.js";

export interface ExecCase {
  index: number;
  name: string;
  hidden: boolean;
  stdin: string;
  expectedStdout: string;
  weight: number;
}

export interface ExecChallenge {
  id: string;
  title: string;
  timeLimitMs: number;
  cases: ExecCase[];
}

export async function loadExecChallenge(challengeId: string): Promise<ExecChallenge | null> {
  const key = redisKeys.challengeExecCache(challengeId);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as ExecChallenge;

  const row = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: { testCases: { orderBy: { index: "asc" } } },
  });
  if (!row) return null;

  const dto: ExecChallenge = {
    id: row.id,
    title: row.title,
    timeLimitMs: row.timeLimitMs,
    cases: row.testCases.map((tc) => ({
      index: tc.index,
      name: tc.name,
      hidden: tc.hidden,
      stdin: tc.stdin,
      expectedStdout: tc.expectedStdout,
      weight: tc.weight,
    })),
  };
  await redis.set(key, JSON.stringify(dto), "EX", CHALLENGE_CACHE_TTL_SECONDS);
  return dto;
}
