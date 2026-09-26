import type { SubmissionDetail } from "@codearena/shared";
import { initialStreamState, submissionStreamReducer } from "./useSubmissionStream";

/**
 * Pure unit tests for the event -> UI state reducer that
 * useSubmissionStream drives. This is the actual logic worth getting right:
 * applying a live WebSocket event stream on top of a snapshot without ever
 * letting the advisory review leak into the deterministic fields, and
 * without losing already-arrived test results.
 */

function detail(overrides: Partial<SubmissionDetail> = {}): SubmissionDetail {
  return {
    id: "sub_1",
    challengeId: "chal_1",
    challengeTitle: "FizzBuzz",
    candidateName: "Ada",
    language: "python",
    status: "running",
    scorePct: 0,
    testsPassed: 0,
    testsTotal: 2,
    runtimeMs: null,
    reviewStatus: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    finishedAt: null,
    code: "print(1)",
    testResults: [],
    review: { status: "pending", provider: null, model: null, summary: null, findings: [], latencyMs: null },
    ...overrides,
  };
}

describe("submissionStreamReducer", () => {
  it("starts with no submission and an unset status", () => {
    expect(initialStreamState.detail).toBeNull();
    expect(initialStreamState.status).toBeNull();
    expect(initialStreamState.testResults.size).toBe(0);
  });

  it("a snapshot seeds detail, status, review, and indexes existing test results", () => {
    const snapshotDetail = detail({
      testResults: [
        { index: 0, name: "case 0", hidden: false, status: "pass", timeMs: 10 },
        { index: 1, name: "case 1", hidden: false, status: "fail", timeMs: 12 },
      ],
    });

    const next = submissionStreamReducer(initialStreamState, {
      kind: "msg",
      msg: { type: "snapshot", submission: snapshotDetail },
    });

    expect(next.detail).toBe(snapshotDetail);
    expect(next.status).toBe("running");
    expect(next.testResults.get(0)?.status).toBe("pass");
    expect(next.testResults.get(1)?.status).toBe("fail");
    expect(next.testResults.size).toBe(2);
  });

  it("a status event updates status only, leaving test results untouched", () => {
    const seeded = submissionStreamReducer(initialStreamState, {
      kind: "msg",
      msg: { type: "snapshot", submission: detail() },
    });

    const next = submissionStreamReducer(seeded, {
      kind: "msg",
      msg: { type: "status", submissionId: "sub_1", status: "running" },
    });

    expect(next.status).toBe("running");
    expect(next.testResults).toBe(seeded.testResults);
  });

  it("test_result events accumulate by index without dropping earlier ones", () => {
    let state = initialStreamState;
    state = submissionStreamReducer(state, {
      kind: "msg",
      msg: {
        type: "test_result",
        submissionId: "sub_1",
        result: { index: 0, name: "case 0", hidden: false, status: "pass", timeMs: 5 },
      },
    });
    state = submissionStreamReducer(state, {
      kind: "msg",
      msg: {
        type: "test_result",
        submissionId: "sub_1",
        result: { index: 1, name: "case 1", hidden: false, status: "pass", timeMs: 7 },
      },
    });

    expect(state.testResults.size).toBe(2);
    expect(state.testResults.get(0)?.timeMs).toBe(5);
    expect(state.testResults.get(1)?.timeMs).toBe(7);
  });

  it("a later test_result for the same index replaces the earlier one", () => {
    let state = submissionStreamReducer(initialStreamState, {
      kind: "msg",
      msg: {
        type: "test_result",
        submissionId: "sub_1",
        result: { index: 0, name: "case 0", hidden: false, status: "pass", timeMs: 5 },
      },
    });
    state = submissionStreamReducer(state, {
      kind: "msg",
      msg: {
        type: "test_result",
        submissionId: "sub_1",
        result: { index: 0, name: "case 0", hidden: false, status: "timeout", timeMs: 5000 },
      },
    });

    expect(state.testResults.size).toBe(1);
    expect(state.testResults.get(0)?.status).toBe("timeout");
  });

  it("run_complete writes the deterministic score onto detail without touching review", () => {
    const seeded = submissionStreamReducer(initialStreamState, {
      kind: "msg",
      msg: { type: "snapshot", submission: detail() },
    });
    const primedReview = submissionStreamReducer(seeded, {
      kind: "msg",
      msg: { type: "review_status", submissionId: "sub_1", status: "pending" },
    });

    const next = submissionStreamReducer(primedReview, {
      kind: "msg",
      msg: {
        type: "run_complete",
        submissionId: "sub_1",
        status: "passed",
        scorePct: 100,
        testsPassed: 2,
        testsTotal: 2,
        runtimeMs: 340,
      },
    });

    expect(next.status).toBe("passed");
    expect(next.detail?.scorePct).toBe(100);
    expect(next.detail?.testsPassed).toBe(2);
    expect(next.detail?.runtimeMs).toBe(340);
    // The whole point of the separation: run_complete never changes review.
    expect(next.review).toBe(primedReview.review);
  });

  it("run_complete before any snapshot leaves detail null (nothing to merge onto)", () => {
    const next = submissionStreamReducer(initialStreamState, {
      kind: "msg",
      msg: {
        type: "run_complete",
        submissionId: "sub_1",
        status: "failed",
        scorePct: 0,
        testsPassed: 0,
        testsTotal: 2,
        runtimeMs: 100,
      },
    });

    expect(next.status).toBe("failed");
    expect(next.detail).toBeNull();
  });

  it("review_status on a fresh state creates a pending review shell with just that status", () => {
    const next = submissionStreamReducer(initialStreamState, {
      kind: "msg",
      msg: { type: "review_status", submissionId: "sub_1", status: "failed" },
    });

    expect(next.review).toEqual({
      status: "failed",
      provider: null,
      model: null,
      summary: null,
      findings: [],
      latencyMs: null,
    });
  });

  it("review_ready replaces the review wholesale and never touches deterministic status/score", () => {
    const seeded = submissionStreamReducer(initialStreamState, {
      kind: "msg",
      msg: { type: "snapshot", submission: detail({ status: "passed", scorePct: 100 }) },
    });

    const next = submissionStreamReducer(seeded, {
      kind: "msg",
      msg: {
        type: "review_ready",
        submissionId: "sub_1",
        review: {
          status: "ready",
          provider: "anthropic",
          model: "claude-sonnet-5",
          summary: "Clean solution.",
          findings: [{ severity: "minor", category: "naming", comment: "Prefer descriptive names." }],
          latencyMs: 812,
        },
      },
    });

    expect(next.review?.status).toBe("ready");
    expect(next.review?.findings).toHaveLength(1);
    // Deterministic fields are exactly as the snapshot left them.
    expect(next.status).toBe("passed");
    expect(next.detail?.scorePct).toBe(100);
  });

  it("a conn action only updates connection state", () => {
    const next = submissionStreamReducer(initialStreamState, { kind: "conn", value: "open" });

    expect(next.connection).toBe("open");
    expect(next.detail).toBeNull();
  });
});
