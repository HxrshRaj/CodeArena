"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

const reviewLabel: Record<string, string> = {
  pending: "…",
  ready: "ready",
  failed: "failed",
};

export default function DashboardPage(): React.ReactNode {
  const { data, isLoading, error } = useQuery({
    queryKey: ["submissions"],
    queryFn: () => api.listSubmissions(),
    refetchInterval: 3000,
  });

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-lg text-slate-100">Recruiter dashboard</h1>
          <p className="text-sm text-slate-400">Past submissions, deterministic scores, and the separate AI review.</p>
        </div>
        {data && (
          <span className="text-xs text-slate-500">
            running now: <span className="text-sky-300">{data.runningNow}</span>
          </span>
        )}
      </div>

      {isLoading && <p className="text-slate-500 text-sm">Loading…</p>}
      {error && <p className="text-rose-400 text-sm">{String(error)}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-xs">
          <thead className="bg-slate-900/60 text-slate-500">
            <tr>
              <th className="text-left font-normal px-3 py-2">Candidate</th>
              <th className="text-left font-normal px-3 py-2">Challenge</th>
              <th className="text-left font-normal px-3 py-2">Status</th>
              <th className="text-right font-normal px-3 py-2">Score</th>
              <th className="text-right font-normal px-3 py-2">Tests</th>
              <th className="text-left font-normal px-3 py-2">AI review</th>
              <th className="text-right font-normal px-3 py-2">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {data?.submissions.map((s) => (
              <tr key={s.id} className="hover:bg-slate-900/40">
                <td className="px-3 py-2">
                  <Link href={`/submissions/${s.id}`} className="text-slate-200 hover:underline">
                    {s.candidateName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-400">{s.challengeTitle}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-3 py-2 text-right text-slate-200">{s.scorePct}%</td>
                <td className="px-3 py-2 text-right text-slate-400">
                  {s.testsPassed}/{s.testsTotal}
                </td>
                <td className="px-3 py-2 text-violet-300/80">
                  {/* Advisory signal, its own column, sourced from the Review table — never merged with Score */}
                  {reviewLabel[s.reviewStatus] ?? "—"}
                </td>
                <td className="px-3 py-2 text-right text-slate-500">
                  {new Date(s.createdAt).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.submissions.length === 0 && (
        <p className="text-slate-600 text-sm mt-4">No submissions yet.</p>
      )}
    </div>
  );
}
