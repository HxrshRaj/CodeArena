/**
 * Prisma rows -> shared DTOs. Two rules enforced here:
 *
 *  1. The public challenge projection never includes stdin/expected for
 *     hidden test cases.
 *  2. The deterministic fields (status, scorePct, testResults) and the
 *     advisory `review` object are assembled from separate sources and
 *     never merged.
 */
import type {
  ChallengeDetail,
  ChallengeSummary,
  Language,
  ReviewDto,
  ReviewFinding,
  SubmissionDetail,
  SubmissionSummary,
  TestResultDto,
} from "@codearena/shared";
import type {
  Challenge,
  Review,
  Submission,
  TestCase,
  TestResult,
} from "@codearena/db";

export function toChallengeSummary(c: Challenge): ChallengeSummary {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    language: c.language as Language,
    difficulty: c.difficulty,
  };
}

export function toChallengeDetail(c: Challenge & { testCases: TestCase[] }): ChallengeDetail {
  return {
    ...toChallengeSummary(c),
    promptMarkdown: c.promptMd,
    starterCode: c.starterCode,
    timeLimitMs: c.timeLimitMs,
    memoryMb: c.memoryMb,
    testCases: [...c.testCases]
      .sort((a, b) => a.index - b.index)
      .map((tc) => ({
        index: tc.index,
        name: tc.name,
        hidden: tc.hidden,
        ...(tc.hidden ? {} : { stdin: tc.stdin, expectedStdout: tc.expectedStdout }),
      })),
  };
}

export function toReviewDto(review: Review | null): ReviewDto {
  if (!review) {
    return {
      status: "pending",
      provider: null,
      model: null,
      summary: null,
      findings: [],
      latencyMs: null,
    };
  }
  return {
    status: review.status,
    provider: review.provider,
    model: review.model,
    summary: review.summary,
    findings: Array.isArray(review.findings)
      ? (review.findings as unknown as ReviewFinding[])
      : [],
    latencyMs: review.latencyMs,
  };
}

function toTestResultDto(r: TestResult, caseByIndex: Map<number, TestCase>): TestResultDto {
  const tc = caseByIndex.get(r.index);
  const hidden = tc?.hidden ?? true;
  return {
    index: r.index,
    name: tc?.name ?? `case #${r.index}`,
    hidden,
    status: r.status,
    timeMs: r.timeMs,
    ...(hidden
      ? {}
      : {
          stdoutExcerpt: r.stdoutExcerpt,
          expectedExcerpt: r.expectedExcerpt,
        }),
    ...(r.message ? { message: r.message } : {}),
  };
}

type SubmissionWithChallenge = Submission & { challenge: Challenge };

export function toSubmissionSummary(s: SubmissionWithChallenge): SubmissionSummary {
  return {
    id: s.id,
    challengeId: s.challengeId,
    challengeTitle: s.challenge.title,
    candidateName: s.candidateName,
    language: s.challenge.language as Language,
    status: s.status,
    scorePct: s.scorePct,
    testsPassed: s.testsPassed,
    testsTotal: s.testsTotal,
    runtimeMs: s.runtimeMs,
    createdAt: s.createdAt.toISOString(),
    finishedAt: s.finishedAt ? s.finishedAt.toISOString() : null,
  };
}

export function toSubmissionDetail(
  s: SubmissionWithChallenge & {
    challenge: Challenge & { testCases: TestCase[] };
    testResults: TestResult[];
    review: Review | null;
  },
): SubmissionDetail {
  const caseByIndex = new Map(s.challenge.testCases.map((tc) => [tc.index, tc]));
  return {
    ...toSubmissionSummary(s),
    code: s.code,
    testResults: [...s.testResults]
      .sort((a, b) => a.index - b.index)
      .map((r) => toTestResultDto(r, caseByIndex)),
    review: toReviewDto(s.review),
  };
}
