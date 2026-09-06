/**
 * Run the LLM code-quality review for one submission.
 *
 * HARD RULE: this module only ever writes the `Review` row. It never touches
 * Submission.status, Submission.scorePct, or any TestResult. The deterministic
 * outcome is finished and immutable by the time this runs. If the LLM call
 * fails, the review is marked `failed` and nothing else changes.
 */
import { prisma, type Prisma } from "@codearena/db";
import type { ReviewDto } from "@codearena/shared";
import { publishEvent } from "../events.js";
import { createLogger } from "../logger.js";
import { getReviewProvider } from "./providers.js";

const log = createLogger("review");

export async function reviewSubmission(submissionId: string): Promise<void> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { challenge: true },
  });
  if (!submission) {
    log.warn("submission gone before review", { submissionId });
    return;
  }

  await prisma.review.upsert({
    where: { submissionId },
    create: { submissionId, status: "pending" },
    update: { status: "pending", error: null },
  });
  await publishEvent(submissionId, { type: "review_status", submissionId, status: "pending" });

  const provider = safeProvider();
  const startedAt = Date.now();

  try {
    if (!provider.ok) throw provider.error;

    const result = await provider.value.review({
      language: submission.challenge.language,
      challengeTitle: submission.challenge.title,
      challengePrompt: submission.challenge.promptMd,
      code: submission.code,
    });
    const latencyMs = Date.now() - startedAt;

    const saved = await prisma.review.update({
      where: { submissionId },
      data: {
        status: "ready",
        provider: result.provider,
        model: result.model,
        summary: result.summary,
        findings: result.findings as unknown as Prisma.InputJsonValue,
        latencyMs,
        error: null,
      },
    });

    const dto: ReviewDto = {
      status: "ready",
      provider: saved.provider,
      model: saved.model,
      summary: saved.summary,
      findings: result.findings,
      latencyMs: saved.latencyMs,
    };
    await publishEvent(submissionId, { type: "review_ready", submissionId, review: dto });
    log.info("review ready", { submissionId, provider: result.provider, latencyMs, findings: result.findings.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.review.update({
      where: { submissionId },
      data: { status: "failed", error: message, latencyMs: Date.now() - startedAt },
    });
    await publishEvent(submissionId, { type: "review_status", submissionId, status: "failed" });
    log.error("review failed (deterministic result is unaffected)", { submissionId, message });
  }
}

function safeProvider():
  | { ok: true; value: ReturnType<typeof getReviewProvider> }
  | { ok: false; error: Error } {
  try {
    return { ok: true, value: getReviewProvider() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
