import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { resolve } from "node:path";

// Load the repo-root .env regardless of where the worker is started from.
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  SANDBOX_IMAGE: z.string().default("codearena-sandbox-python:latest"),
  SANDBOX_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  SANDBOX_MEMORY_MB: z.coerce.number().int().positive().default(256),
  SANDBOX_CPUS: z.coerce.number().positive().default(0.5),
  SANDBOX_PIDS_LIMIT: z.coerce.number().int().positive().default(64),
  EXECUTOR_CONCURRENCY: z.coerce.number().int().positive().default(2),

  LLM_PROVIDER: z.enum(["anthropic", "openai", "stub"]).default("stub"),
  ANTHROPIC_API_KEY: z.string().default(""),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o"),
});

export const config = schema.parse(process.env);
export type Config = typeof config;
