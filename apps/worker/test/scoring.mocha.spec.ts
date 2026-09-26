/**
 * Mocha + Chai suite for the deterministic scoring logic — kept in its own
 * runner, separate from the Jest suite over in apps/web, to genuinely
 * exercise Mocha's own runner (`describe`/`it` via Mocha, assertions via
 * Chai's `expect`) against real Node-side business logic.
 */
import { expect } from "chai";
import { scoreResults } from "../src/executor/scoring.js";

describe("scoreResults", () => {
  it("scores 100% and status passed when every case passes", () => {
    const result = scoreResults({
      cases: [
        { index: 0, weight: 1 },
        { index: 1, weight: 1 },
      ],
      results: [
        { index: 0, status: "pass" },
        { index: 1, status: "pass" },
      ],
    });

    expect(result.scorePct).to.equal(100);
    expect(result.testsPassed).to.equal(2);
    expect(result.testsTotal).to.equal(2);
    expect(result.status).to.equal("passed");
  });

  it("scores 0% and status failed when every case fails", () => {
    const result = scoreResults({
      cases: [{ index: 0, weight: 1 }],
      results: [{ index: 0, status: "fail" }],
    });

    expect(result.scorePct).to.equal(0);
    expect(result.status).to.equal("failed");
  });

  it("weights partial credit by test-case weight, not raw case count", () => {
    // One heavy case (weight 3) plus two light ones (weight 1 each) = 5 total.
    // Only the heavy one passes -> 3/5 = 60%.
    const result = scoreResults({
      cases: [
        { index: 0, weight: 3 },
        { index: 1, weight: 1 },
        { index: 2, weight: 1 },
      ],
      results: [
        { index: 0, status: "pass" },
        { index: 1, status: "fail" },
        { index: 2, status: "error" },
      ],
    });

    expect(result.scorePct).to.equal(60);
    expect(result.testsPassed).to.equal(1);
    // Any non-pass status still fails the run overall, even with partial credit.
    expect(result.status).to.equal("failed");
  });

  it("treats timeout and error results the same as fail for scoring purposes", () => {
    const result = scoreResults({
      cases: [
        { index: 0, weight: 1 },
        { index: 1, weight: 1 },
      ],
      results: [
        { index: 0, status: "timeout" },
        { index: 1, status: "error" },
      ],
    });

    expect(result.scorePct).to.equal(0);
    expect(result.testsPassed).to.equal(0);
  });

  it("a submission with zero test cases is not marked passed", () => {
    const result = scoreResults({ cases: [], results: [] });

    expect(result.testsTotal).to.equal(0);
    expect(result.status).to.equal("failed");
    // Guards the `|| 1` divisor fallback: no NaN/Infinity from a 0/0 division.
    expect(result.scorePct).to.equal(0);
  });

  it("documents current behavior for a result index with no matching test case: it still counts as a pass at weight 1", () => {
    // scoreResults trusts its `results` input; it doesn't cross-check indexes
    // against `cases` beyond looking up a weight (defaulting to 1 on a miss).
    // In practice the executor only ever feeds it results for that
    // submission's own cases, so this can't happen through the real pipeline
    // — but it's worth pinning the actual behavior rather than an assumed one.
    const result = scoreResults({
      cases: [{ index: 0, weight: 1 }],
      results: [
        { index: 0, status: "pass" },
        { index: 99, status: "pass" },
      ],
    });

    expect(result.testsPassed).to.equal(2);
    expect(result.scorePct).to.equal(200);
    expect(result.testsTotal).to.equal(1);
  });
});
