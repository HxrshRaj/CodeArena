"use client";

import { useState } from "react";
import type {
  PublicTestCase,
  SubmissionStatus,
  TestResultDto,
  TestResultStatus,
} from "@codearena/shared";

const rowStyle: Record<TestResultStatus | "pending", string> = {
  pending: "text-slate-500",
  pass: "text-emerald-400",
  fail: "text-rose-400",
  error: "text-amber-400",
  timeout: "text-amber-400",
};

const mark: Record<TestResultStatus | "pending", string> = {
  pending: "•",
  pass: "✓",
  fail: "✗",
  error: "!",
  timeout: "⧖",
};

export function TestResultsPanel({
  cases,
  results,
  status,
  scorePct,
  testsPassed,
  testsTotal,
  runtimeMs,
}: {
  cases: PublicTestCase[];
  results: Map<number, TestResultDto>;
  status: SubmissionStatus | null;
  scorePct: number | null;
  testsPassed: number | null;
  testsTotal: number | null;
  runtimeMs: number | null;
}): React.ReactNode {
  const done = status === "passed" || status === "failed" || status === "error";

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
        <div>
          <h2 className="text-sm text-slate-100">Test results</h2>
          <p className="text-[11px] text-slate-500">Deterministic — sandboxed execution decides the score</p>
        </div>
        {done && (
          <div className="text-right">
            <div className="text-sm text-slate-100">{scorePct ?? 0}%</div>
            <div className="text-[11px] text-slate-500">
              {testsPassed ?? 0}/{testsTotal ?? cases.length} cases
              {runtimeMs != null && ` · ${runtimeMs}ms`}
            </div>
          </div>
        )}
      </header>

      <ul className="divide-y divide-slate-800/70">
        {cases.map((c) => {
          const r = results.get(c.index);
          const st: TestResultStatus | "pending" = r?.status ?? "pending";
          return <Row key={c.index} testCase={c} result={r} st={st} />;
        })}
      </ul>
    </section>
  );
}

function Row({
  testCase,
  result,
  st,
}: {
  testCase: PublicTestCase;
  result: TestResultDto | undefined;
  st: TestResultStatus | "pending";
}): React.ReactNode {
  const [open, setOpen] = useState(false);
  const canExpand = !testCase.hidden && (result?.stdoutExcerpt != null || result?.expectedExcerpt != null);

  return (
    <li className="px-4 py-2 text-xs">
      <div
        className={`flex items-center gap-2 ${canExpand ? "cursor-pointer" : ""}`}
        onClick={() => canExpand && setOpen((o) => !o)}
      >
        <span className={`${rowStyle[st]} w-4 text-center`}>{mark[st]}</span>
        <span className="text-slate-300">
          #{testCase.index} {testCase.name}
        </span>
        {testCase.hidden && <span className="text-[10px] text-slate-600 uppercase">hidden</span>}
        <span className="ml-auto text-slate-500">
          {st === "pending" ? "…" : `${result?.timeMs ?? 0}ms`}
        </span>
      </div>

      {result?.message && st !== "pass" && (
        <div className="mt-1 pl-6 text-amber-500/80">{result.message}</div>
      )}

      {open && canExpand && (
        <div className="mt-2 pl-6 grid gap-2 sm:grid-cols-2">
          <div>
            <div className="text-slate-600 mb-1">got</div>
            <pre className="thin-scroll overflow-auto max-h-40 rounded bg-black/40 p-2 text-slate-300 whitespace-pre-wrap">
              {result?.stdoutExcerpt ?? ""}
            </pre>
          </div>
          <div>
            <div className="text-slate-600 mb-1">expected</div>
            <pre className="thin-scroll overflow-auto max-h-40 rounded bg-black/40 p-2 text-slate-300 whitespace-pre-wrap">
              {result?.expectedExcerpt ?? ""}
            </pre>
          </div>
        </div>
      )}
    </li>
  );
}
