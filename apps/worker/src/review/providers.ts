import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../config.js";
import {
  buildUserPrompt,
  normalizeFindings,
  REVIEW_JSON_SCHEMA,
  SYSTEM_PROMPT,
  type RawReview,
  type ReviewProvider,
  type ReviewRequest,
  type ReviewResult,
} from "./prompt.js";

// --- Anthropic ---------------------------------------------------------------

class AnthropicProvider implements ReviewProvider {
  readonly name = "anthropic";
  #client: Anthropic;

  constructor(apiKey: string) {
    this.#client = new Anthropic({ apiKey });
  }

  async review(req: ReviewRequest): Promise<ReviewResult> {
    const model = config.ANTHROPIC_MODEL;
    const res = await this.#client.messages.create({
      model,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      tool_choice: { type: "tool", name: "submit_review" },
      tools: [
        {
          name: "submit_review",
          description: "Return the structured code-quality review.",
          input_schema: REVIEW_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      messages: [{ role: "user", content: buildUserPrompt(req) }],
    });

    const toolUse = res.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("anthropic: model did not return a tool_use block");
    }
    const raw = toolUse.input as RawReview;
    return {
      provider: this.name,
      model,
      summary: String(raw.summary ?? "").slice(0, 2000),
      findings: normalizeFindings(raw),
    };
  }
}

// --- OpenAI ----------------------------------------------------------------

class OpenAIProvider implements ReviewProvider {
  readonly name = "openai";
  #client: OpenAI;

  constructor(apiKey: string) {
    this.#client = new OpenAI({ apiKey });
  }

  async review(req: ReviewRequest): Promise<ReviewResult> {
    const model = config.OPENAI_MODEL;
    const res = await this.#client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(req) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "code_review", schema: REVIEW_JSON_SCHEMA, strict: true },
      },
    });
    const content = res.choices[0]?.message.content ?? "{}";
    const raw = JSON.parse(content) as RawReview;
    return {
      provider: this.name,
      model,
      summary: String(raw.summary ?? "").slice(0, 2000),
      findings: normalizeFindings(raw),
    };
  }
}

// --- Stub (no network) ----------------------------------------------------

/**
 * Runs the whole review path — queue, table, WS events, UI — with zero API
 * dependency. Findings come from a couple of cheap static heuristics so the
 * panel has something real-looking to render.
 */
class StubProvider implements ReviewProvider {
  readonly name = "stub";

  async review(req: ReviewRequest): Promise<ReviewResult> {
    const lines = req.code.split("\n");
    const raw: RawReview = { summary: "", findings: [] };

    const longLine = lines.findIndex((l) => l.length > 100);
    if (longLine >= 0) {
      raw.findings.push({
        severity: "minor",
        category: "readability",
        comment: "Line exceeds 100 characters; consider wrapping.",
        line: longLine + 1,
      });
    }
    if (/\bl\b|\bI\b|\bO\b/.test(req.code)) {
      raw.findings.push({
        severity: "info",
        category: "naming",
        comment: "Avoid single-letter names like l/I/O; they are easy to misread.",
        line: null,
      });
    }
    if (!/def\s+\w+/.test(req.code)) {
      raw.findings.push({
        severity: "minor",
        category: "structure",
        comment: "Top-level script with no functions; extracting a `main()` would help.",
        line: null,
      });
    }
    raw.summary =
      `Stub review (no LLM call). ${raw.findings.length} heuristic finding(s) for ` +
      `"${req.challengeTitle}". Set LLM_PROVIDER=anthropic|openai with an API key for a real review.`;

    return {
      provider: this.name,
      model: "none",
      summary: raw.summary,
      findings: normalizeFindings(raw),
    };
  }
}

export function getReviewProvider(): ReviewProvider {
  switch (config.LLM_PROVIDER) {
    case "anthropic": {
      if (!config.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY not set (or use LLM_PROVIDER=stub)");
      }
      return new AnthropicProvider(config.ANTHROPIC_API_KEY);
    }
    case "openai": {
      if (!config.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY not set (or use LLM_PROVIDER=stub)");
      }
      return new OpenAIProvider(config.OPENAI_API_KEY);
    }
    default:
      return new StubProvider();
  }
}
