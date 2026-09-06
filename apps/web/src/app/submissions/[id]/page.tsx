"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { PublicTestCase } from "@codearena/shared";
import { api } from "@/lib/api";
import { useSubmissionStream } from "@/lib/useSubmissionStream";
import { Editor } from "@/components/Editor";
import { StatusBadge } from "@/components/StatusBadge";
import { TestResultsPanel } from "@/components/TestResultsPanel";
import { ReviewPanel } from "@/components/ReviewPanel";

export default function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactNode {
  const { id } = use(params);
  const stream = useSubmissionStream(id);
  const detail = stream.detail;

  // Full case list (incl. not-yet-run) for stable panel rows.
  const { data: challenge } = useQuery({
    queryKey: ["challenge", detail?.challengeId],
    queryFn: () => api.getChallenge(detail!.challengeId),
    enabled: !!detail?.challengeId,
  });

  const cases: PublicTestCase[] =
    challenge?.testCases ??
    [...stream.testResults.values()]
      .sort((a, b) => a.index - b.index)
      .map((r) => ({ index: r.index, name: r.name, hidden: r.hidden }));

  if (!detail) {
    return (
      <p className="text-slate-500 text-sm">
        Connecting… ({stream.connection}){" "}
        {stream.connection === "closed" && "— submission not found or API unreachable"}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/submissions" className="text-xs text-slate-500 hover:text-slate-300">
          ← dashboard
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-lg text-slate-100">{detail.candidateName}</h1>
          <StatusBadge status={stream.status} />
          <span className="text-xs text-slate-500">{detail.challengeTitle}</span>
        </div>
        <p className="text-[11px] text-slate-600 mt-0.5">
          submitted {new Date(detail.createdAt).toLocaleString()} · ws {stream.connection}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="text-xs text-slate-500 mb-2">Submitted code</h2>
          <Editor value={detail.code} language={detail.language} readOnly />
        </div>

        <div className="space-y-4">
          <TestResultsPanel
            cases={cases}
            results={stream.testResults}
            status={stream.status}
            scorePct={detail.scorePct}
            testsPassed={detail.testsPassed}
            testsTotal={detail.testsTotal}
            runtimeMs={detail.runtimeMs}
          />
          <ReviewPanel review={stream.review} />
        </div>
      </div>
    </div>
  );
}
