"use client";

import type { ReviewDto, ReviewSeverity } from "@codearena/shared";

const severityChip: Record<ReviewSeverity, string> = {
  info: "bg-slate-700 text-slate-200",
  minor: "bg-violet-900 text-violet-200",
  major: "bg-fuchsia-900 text-fuchsia-100",
};

/**
 * Advisory panel. Deliberately styled unlike the deterministic results
 * (violet, separate card, explicit disclaimer) so a viewer never confuses
 * AI commentary with pass/fail.
 */
export function ReviewPanel({
  review,
  active = true,
}: {
  review: ReviewDto | null;
  /** false before a submission exists — show an idle hint, not a spinner. */
  active?: boolean;
}): React.ReactNode {
  const status = review?.status ?? "pending";

  return (
    <section className="rounded-lg border border-advisory-border bg-advisory-bg">
      <header className="px-4 py-2.5 border-b border-advisory-border">
        <div className="flex items-center gap-2">
          <span className="text-violet-300 text-sm">AI code review</span>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-950 text-violet-300">
            advisory
          </span>
        </div>
        <p className="text-[11px] text-violet-400/70 mt-0.5">
          Style and quality only. Does not affect the score or pass/fail.
        </p>
      </header>

      <div className="p-4 text-xs">
        {!active && <p className="text-violet-300/50">Submit a solution to get a review.</p>}
        {active && status === "pending" && (
          <p className="text-violet-300/70 animate-pulse">Analyzing code quality…</p>
        )}
        {status === "failed" && (
          <p className="text-amber-400/90">
            Review unavailable (the LLM call failed). The test results above are unaffected.
          </p>
        )}
        {status === "ready" && review && (
          <div className="space-y-3">
            <p className="text-violet-100 leading-relaxed">{review.summary}</p>

            {review.findings.length > 0 ? (
              <ul className="space-y-2">
                {review.findings.map((f, i) => (
                  <li key={i} className="rounded border border-advisory-border/60 bg-black/20 p-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${severityChip[f.severity]}`}>
                        {f.severity}
                      </span>
                      <span className="text-violet-300/80">{f.category}</span>
                      {f.line != null && <span className="text-violet-400/50">line {f.line}</span>}
                    </div>
                    <p className="text-violet-100/90 mt-1">{f.comment}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-violet-300/60">No style findings.</p>
            )}

            <p className="text-[10px] text-violet-400/50">
              {review.provider}
              {review.model && review.model !== "none" ? ` · ${review.model}` : ""}
              {review.latencyMs != null ? ` · ${review.latencyMs}ms` : ""}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
