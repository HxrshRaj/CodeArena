/**
 * Execute one submission end to end:
 *
 *   mark running (DB + Redis state + WS event)
 *     -> load challenge (cache-aside)
 *     -> run sandbox, and for every streamed case: persist TestResult + emit WS `test_result`
 *     -> deterministic score -> update Submission -> emit WS `run_complete`
 *     -> clear Redis run-state -> enqueue the (separate) LLM review job
 *
 * The LLM review is only *enqueued* here. It runs in its own worker, writes
 * its own table, and nothing it produces is read back into the score.
 */
import { prisma, type TestResultStatus } from "@codearena/db";
import {
  redisKeys,
  type SubmissionStatus,
  type TestResultDto,
} from "@codearena/shared";
import type { RunnerCaseResult } from "@codearena/shared";
import { redis } from "../redis.js";
import { publishEvent } from "../events.js";
import { createLogger } from "../logger.js";
import { loadExecChallenge } from "./challenge.js";
import { runSandbox } from "./sandbox.js";
import { scoreResults } from "./scoring.js";

const log = createLogger("executor");

const DB_EXCERPT_MAX = 2000;
const clip = (s: string): string => (s.length <= DB_EXCERPT_MAX ? s : s.slice(0, DB_EXCERPT_MAX) + "…");

function toTestResultDto(r: RunnerCaseResult): TestResultDto {
  return {
    index: r.index,
    name: r.name,
    hidden: r.hidden,
    status: r.status,
    timeMs: r.timeMs,
    // Hidden cases never expose their I/O over the wire.
    ...(r.hidden ? {} : { stdoutExcerpt: clip(r.stdout), expectedExcerpt: clip(r.expected) }),
    ...(r.message ? { message: r.message } : {}),
  };
}

async function setStatus(submissionId: string, status: SubmissionStatus): Promise<void> {
  await publishEvent(submissionId, { type: "status", submissionId, status });
}

export async function executeSubmission(submissionId: string): Promise<void> {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission) {
    log.warn("submission vanished before execution", { submissionId });
    return;
  }

  // --- mark running ---------------------------------------------------------
  const startedAt = new Date();
  await prisma.submission.update({
    where: { id: submissionId },
    data: { status: "running", startedAt },
  });
  await redis
    .multi()
    .sadd(redisKeys.execRunning, submissionId)
    .hset(redisKeys.execState(submissionId), { status: "running", startedAt: startedAt.toISOString() })
    .exec();
  await setStatus(submissionId, "running");

  const challenge = await loadExecChallenge(submission.challengeId);
  if (!challenge) {
    await failSubmission(submissionId, "challenge not found at execution time");
    return;
  }

  // --- run sandbox, streaming each case -----------------------------------
  const outcome = await runSandbox(
    {
      submissionId,
      code: submission.code,
      timeLimitMs: challenge.timeLimitMs,
      cases: challenge.cases.map((c) => ({
        index: c.index,
        name: c.name,
        hidden: c.hidden,
        stdin: c.stdin,
        expectedStdout: c.expectedStdout,
      })),
    },
    (r) => {
      // Fire and forget; ordering per submission is preserved by index.
      void persistAndPublishCase(submissionId, r).catch((err) =>
        log.error("failed to persist case result", { submissionId, index: r.index, err: String(err) }),
      );
    },
  );

  if (outcome.fatal) {
    await failSubmission(submissionId, outcome.fatal);
    return;
  }

  // Make sure every streamed case is durably written before we score.
  await Promise.all(
    outcome.caseResults.map((r) => persistCase(submissionId, r)),
  );

  const score = scoreResults({
    cases: challenge.cases.map((c) => ({ index: c.index, weight: c.weight })),
    results: outcome.caseResults.map((r) => ({ index: r.index, status: r.status })),
  });

  await prisma.submission.update({
    where: { id: submissionId },
    data: {
      status: score.status,
      scorePct: score.scorePct,
      testsPassed: score.testsPassed,
      testsTotal: score.testsTotal,
      runtimeMs: outcome.wallMs,
      finishedAt: new Date(),
    },
  });

  await publishEvent(submissionId, {
    type: "run_complete",
    submissionId,
    status: score.status,
    scorePct: score.scorePct,
    testsPassed: score.testsPassed,
    testsTotal: score.testsTotal,
    runtimeMs: outcome.wallMs,
  });

  await clearRunState(submissionId);
  await enqueueReview(submissionId);

  log.info("submission executed", {
    submissionId,
    status: score.status,
    scorePct: score.scorePct,
    wallMs: outcome.wallMs,
  });
}

async function persistCase(submissionId: string, r: RunnerCaseResult): Promise<void> {
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    select: { challengeId: true },
  });
  const testCase = await prisma.testCase.findUniqueOrThrow({
    where: { challengeId_index: { challengeId: sub.challengeId, index: r.index } },
    select: { id: true },
  });

  const fields = {
    status: r.status as TestResultStatus,
    timeMs: r.timeMs,
    stdoutExcerpt: clip(r.stdout),
    expectedExcerpt: clip(r.expected),
    message: r.message ?? "",
  };
  await prisma.testResult.upsert({
    where: { submissionId_index: { submissionId, index: r.index } },
    create: { submissionId, testCaseId: testCase.id, index: r.index, ...fields },
    update: fields,
  });
}

async function persistAndPublishCase(submissionId: string, r: RunnerCaseResult): Promise<void> {
  await persistCase(submissionId, r);
  const result: TestResultDto = toTestResultDto(r);
  await publishEvent(submissionId, { type: "test_result", submissionId, result });
}

async function failSubmission(submissionId: string, reason: string): Promise<void> {
  log.warn("submission errored", { submissionId, reason });
  await prisma.submission.update({
    where: { id: submissionId },
    data: { status: "error", finishedAt: new Date(), runtimeMs: 0 },
  });
  await publishEvent(submissionId, {
    type: "run_complete",
    submissionId,
    status: "error",
    scorePct: 0,
    testsPassed: 0,
    testsTotal: 0,
    runtimeMs: 0,
  });
  await setStatus(submissionId, "error");
  await clearRunState(submissionId);
  // A failed run still gets a review — code quality is independent of whether it ran.
  await enqueueReview(submissionId);
}

async function clearRunState(submissionId: string): Promise<void> {
  await redis
    .multi()
    .srem(redisKeys.execRunning, submissionId)
    .del(redisKeys.execState(submissionId))
    .exec();
}

/**
 * Hand off to the separate review worker. Only the queue push and a pending
 * row live here; the review worker owns all review lifecycle events and is
 * the only thing that writes review content.
 */
async function enqueueReview(submissionId: string): Promise<void> {
  await prisma.review.upsert({
    where: { submissionId },
    create: { submissionId, status: "pending" },
    update: { status: "pending", error: null },
  });
  await redis.lpush(redisKeys.reviewQueue, submissionId);
}
