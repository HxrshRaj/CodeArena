import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@codearena/db";
import { redisKeys, type CreateSubmissionResponse } from "@codearena/shared";
import { redis } from "../redis.js";
import { resolveChallengeId } from "../cache.js";
import { toSubmissionDetail, toSubmissionSummary } from "../mappers.js";
import { createLogger } from "../logger.js";

const log = createLogger("submissions");

const createBody = z.object({
  challengeId: z.string().min(1), // id or slug
  candidateName: z.string().trim().min(1).max(80),
  code: z.string().min(1).max(64_000),
});

const submissionInclude = {
  challenge: { include: { testCases: true } },
  testResults: true,
  review: true,
} as const;

export async function submissionRoutes(app: FastifyInstance): Promise<void> {
  // --- create + enqueue --------------------------------------------------
  app.post("/api/submissions", async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body", details: parsed.error.flatten() });
    }
    const { candidateName, code } = parsed.data;

    const challengeId = await resolveChallengeId(parsed.data.challengeId);
    if (!challengeId) return reply.code(404).send({ error: "challenge not found" });

    const submission = await prisma.submission.create({
      data: { challengeId, candidateName, code, status: "queued" },
    });

    // Redis: enqueue for execution + record queue state. The executor worker
    // BRPOPs exec:queue; the dashboard reads exec:running / exec:state.
    await redis
      .multi()
      .lpush(redisKeys.execQueue, submission.id)
      .hset(redisKeys.execState(submission.id), {
        status: "queued",
        queuedAt: new Date().toISOString(),
      })
      .expire(redisKeys.execState(submission.id), 3600)
      .exec();

    log.info("submission queued", { submissionId: submission.id, challengeId });

    const res: CreateSubmissionResponse = { submissionId: submission.id };
    return reply.code(201).send(res);
  });

  // --- list (recruiter dashboard) -------------------------------------------
  app.get<{ Querystring: { challengeId?: string; limit?: string } }>(
    "/api/submissions",
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
      const rows = await prisma.submission.findMany({
        where: req.query.challengeId ? { challengeId: req.query.challengeId } : undefined,
        include: { challenge: true },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      // "running now" straight out of Redis, not a DB scan.
      const runningIds = await redis.smembers(redisKeys.execRunning);

      return {
        submissions: rows.map(toSubmissionSummary),
        runningNow: runningIds.length,
      };
    },
  );

  // --- detail ------------------------------------------------------------
  app.get<{ Params: { id: string } }>("/api/submissions/:id", async (req, reply) => {
    const row = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: submissionInclude,
    });
    if (!row) return reply.code(404).send({ error: "submission not found" });
    return toSubmissionDetail(row);
  });
}
