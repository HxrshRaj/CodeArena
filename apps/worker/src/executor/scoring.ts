import type { SubmissionStatus, TestResultStatus } from "@codearena/shared";

export interface ScoreInput {
  cases: Array<{ index: number; weight: number }>;
  results: Array<{ index: number; status: TestResultStatus }>;
}

export interface Score {
  scorePct: number;
  testsPassed: number;
  testsTotal: number;
  status: Extract<SubmissionStatus, "passed" | "failed">;
}

/**
 * Purely deterministic. Weighted by test-case weight. The LLM review is never
 * an input here.
 */
export function scoreResults({ cases, results }: ScoreInput): Score {
  const weightByIndex = new Map(cases.map((c) => [c.index, c.weight]));
  const totalWeight = cases.reduce((sum, c) => sum + c.weight, 0) || 1;

  let earned = 0;
  let passed = 0;
  for (const r of results) {
    if (r.status === "pass") {
      earned += weightByIndex.get(r.index) ?? 1;
      passed += 1;
    }
  }

  return {
    scorePct: Math.round((earned / totalWeight) * 100),
    testsPassed: passed,
    testsTotal: cases.length,
    status: passed === cases.length && cases.length > 0 ? "passed" : "failed",
  };
}
