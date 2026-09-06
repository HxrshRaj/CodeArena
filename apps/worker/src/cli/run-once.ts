/**
 * Standalone sandbox check. No HTTP, no queue, no Redis, no Submission row.
 * It loads a seeded challenge, runs a solution file through the real sandbox,
 * and prints results as they stream. Use it to trust the execution layer
 * before anything is wired on top of it.
 *
 *   npm run run:once -w @codearena/worker -- --slug sum-of-list --file sol.py
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { prisma } from "@codearena/db";
import { runSandbox, type SandboxCase } from "../executor/sandbox.js";
import { scoreResults } from "../executor/scoring.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      slug: { type: "string" },
      file: { type: "string" },
    },
  });

  if (!values.slug || !values.file) {
    console.error("usage: run-once --slug <challenge-slug> --file <solution.py>");
    process.exit(2);
  }

  const challenge = await prisma.challenge.findUnique({
    where: { slug: values.slug },
    include: { testCases: { orderBy: { index: "asc" } } },
  });
  if (!challenge) {
    console.error(`no challenge with slug "${values.slug}". Seeded slugs: ` + (await seededSlugs()));
    process.exit(2);
  }

  const code = await readFile(values.file, "utf8");
  const cases: SandboxCase[] = challenge.testCases.map((tc) => ({
    index: tc.index,
    name: tc.name,
    hidden: tc.hidden,
    stdin: tc.stdin,
    expectedStdout: tc.expectedStdout,
  }));

  console.log(`\n${challenge.title}  (${cases.length} test cases, ${challenge.timeLimitMs}ms/case)\n`);

  const outcome = await runSandbox(
    { submissionId: "cli", code, timeLimitMs: challenge.timeLimitMs, cases },
    (r) => {
      const mark = r.status === "pass" ? "PASS" : r.status.toUpperCase();
      console.log(
        `  [${mark.padEnd(7)}] #${r.index} ${r.name}  (${r.timeMs}ms)` +
          (r.message ? `\n            ${r.message}` : ""),
      );
    },
  );

  if (outcome.fatal) {
    console.error(`\nFATAL: ${outcome.fatal}`);
    process.exit(1);
  }

  const score = scoreResults({
    cases: challenge.testCases.map((tc) => ({ index: tc.index, weight: tc.weight })),
    results: outcome.caseResults.map((r) => ({ index: r.index, status: r.status })),
  });

  console.log(
    `\n${score.status.toUpperCase()}  ${score.testsPassed}/${score.testsTotal} cases  ` +
      `score ${score.scorePct}%  wall ${outcome.wallMs}ms\n`,
  );
  process.exit(score.status === "passed" ? 0 : 1);
}

async function seededSlugs(): Promise<string> {
  const all = await prisma.challenge.findMany({ select: { slug: true } });
  return all.map((c) => c.slug).join(", ");
}

main().finally(() => prisma.$disconnect());
