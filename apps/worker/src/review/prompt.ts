import type { ReviewFinding } from "@codearena/shared";

export interface ReviewRequest {
  language: string;
  challengeTitle: string;
  challengePrompt: string;
  code: string;
}

export interface ReviewResult {
  provider: string;
  model: string;
  summary: string;
  findings: ReviewFinding[];
}

export interface ReviewProvider {
  readonly name: string;
  review(req: ReviewRequest): Promise<ReviewResult>;
}

export const SYSTEM_PROMPT = [
  "You are a senior engineer giving a brief CODE QUALITY review.",
  "",
  "You are NOT judging correctness. A separate deterministic test suite already",
  "decides pass/fail and the score. Do not comment on whether the code passes",
  "tests, handles the sample input, or produces the right output.",
  "",
  "Focus only on: readability, naming, structure, function decomposition,",
  "idiomatic style for the language, error handling, and unnecessary complexity.",
  "Be concrete and specific. Prefer 2-6 findings. If the code is genuinely clean,",
  "say so and return few or no findings.",
].join("\n");

export function buildUserPrompt(req: ReviewRequest): string {
  return [
    `Language: ${req.language}`,
    `Challenge: ${req.challengeTitle}`,
    "",
    "Challenge description (for context only — do not review the description):",
    req.challengePrompt,
    "",
    "Submitted code:",
    "```" + req.language,
    req.code,
    "```",
  ].join("\n");
}

/** Shared JSON schema for the structured response across providers. */
export const REVIEW_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "2-4 sentence overall assessment of quality and style (not correctness).",
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["info", "minor", "major"] },
          category: {
            type: "string",
            description: "e.g. naming, structure, complexity, error-handling, idiom",
          },
          comment: { type: "string" },
          line: {
            type: ["integer", "null"],
            description: "1-based line in the submitted code, or null",
          },
        },
        required: ["severity", "category", "comment", "line"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "findings"],
  additionalProperties: false,
} as const;

export interface RawReview {
  summary: string;
  findings: Array<{
    severity: string;
    category: string;
    comment: string;
    line: number | null;
  }>;
}

export function normalizeFindings(raw: RawReview): ReviewFinding[] {
  const allowed = new Set(["info", "minor", "major"]);
  return raw.findings.slice(0, 12).map((f) => ({
    severity: (allowed.has(f.severity) ? f.severity : "info") as ReviewFinding["severity"],
    category: String(f.category || "general").slice(0, 40),
    comment: String(f.comment || "").slice(0, 800),
    ...(typeof f.line === "number" && f.line > 0 ? { line: Math.floor(f.line) } : {}),
  }));
}
