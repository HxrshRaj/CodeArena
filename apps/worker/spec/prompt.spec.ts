/**
 * A small, deliberately scoped Jasmine spec. CodeArena otherwise uses Jest
 * (web) and Mocha+Chai (worker) — this exists purely to demonstrate genuine
 * Jasmine BDD syntax (its own `describe`/`it` runner and its own `expect`
 * matchers, no Chai involved) against one real unit of logic: normalizing an
 * LLM review's findings before they're persisted and shown in the UI.
 */
import { normalizeFindings, type RawReview } from "../src/review/prompt.js";

describe("normalizeFindings", () => {
  it("keeps a valid severity as-is", () => {
    const raw: RawReview = {
      summary: "",
      findings: [{ severity: "major", category: "complexity", comment: "Nested loops.", line: 12 }],
    };

    const result = normalizeFindings(raw);

    expect(result[0].severity).toBe("major");
    expect(result[0].line).toBe(12);
  });

  it("falls an unrecognized severity back to info", () => {
    const raw: RawReview = {
      summary: "",
      findings: [{ severity: "critical", category: "security", comment: "n/a", line: null }],
    };

    const result = normalizeFindings(raw);

    expect(result[0].severity).toBe("info");
  });

  it("defaults a missing category to 'general'", () => {
    const raw: RawReview = {
      summary: "",
      findings: [{ severity: "info", category: "", comment: "Looks fine.", line: null }],
    };

    expect(normalizeFindings(raw)[0].category).toEqual("general");
  });

  it("omits the line field entirely when line is null, zero, or negative", () => {
    const raw: RawReview = {
      summary: "",
      findings: [
        { severity: "info", category: "x", comment: "a", line: null },
        { severity: "info", category: "x", comment: "b", line: 0 },
        { severity: "info", category: "x", comment: "c", line: -3 },
      ],
    };

    const result = normalizeFindings(raw);

    for (const finding of result) {
      expect(Object.prototype.hasOwnProperty.call(finding, "line")).toBeFalse();
    }
  });

  it("floors a fractional line number", () => {
    const raw: RawReview = {
      summary: "",
      findings: [{ severity: "info", category: "x", comment: "a", line: 7.9 }],
    };

    expect(normalizeFindings(raw)[0].line).toBe(7);
  });

  it("truncates an overlong category to 40 characters and comment to 800", () => {
    const raw: RawReview = {
      summary: "",
      findings: [
        {
          severity: "minor",
          category: "x".repeat(100),
          comment: "y".repeat(1000),
          line: null,
        },
      ],
    };

    const result = normalizeFindings(raw);

    expect(result[0].category.length).toBe(40);
    expect(result[0].comment.length).toBe(800);
  });

  it("caps the number of findings at 12 even when the model returns more", () => {
    const raw: RawReview = {
      summary: "",
      findings: Array.from({ length: 20 }, (_, i) => ({
        severity: "info",
        category: `finding-${i}`,
        comment: "note",
        line: null,
      })),
    };

    const result = normalizeFindings(raw);

    expect(result.length).toBe(12);
    expect(result[0].category).toBe("finding-0");
    expect(result[11].category).toBe("finding-11");
  });
});
