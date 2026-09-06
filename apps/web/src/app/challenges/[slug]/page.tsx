"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSubmissionStream } from "@/lib/useSubmissionStream";
import { Editor } from "@/components/Editor";
import { StatusBadge } from "@/components/StatusBadge";
import { TestResultsPanel } from "@/components/TestResultsPanel";
import { ReviewPanel } from "@/components/ReviewPanel";

export default function ChallengePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): React.ReactNode {
  const { slug } = use(params);

  const { data: challenge, isLoading, error } = useQuery({
    queryKey: ["challenge", slug],
    queryFn: () => api.getChallenge(slug),
  });

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (challenge && code === "") setCode(challenge.starterCode);
  }, [challenge, code]);

  const stream = useSubmissionStream(submissionId);

  async function submit(): Promise<void> {
    if (!challenge) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { submissionId: id } = await api.createSubmission({
        challengeId: challenge.id,
        candidateName: name.trim() || "Anonymous",
        code,
      });
      setSubmissionId(id);
    } catch (e) {
      setSubmitError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <p className="text-slate-500 text-sm">Loading…</p>;
  if (error || !challenge)
    return <p className="text-rose-400 text-sm">Failed to load challenge: {String(error)}</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: prompt + editor */}
      <div className="space-y-4">
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← all challenges
          </Link>
          <h1 className="text-lg text-slate-100 mt-1">{challenge.title}</h1>
        </div>

        <pre className="thin-scroll overflow-auto max-h-56 whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-300">
          {challenge.promptMarkdown}
        </pre>

        <Editor value={code} onChange={setCode} language={challenge.language} />

        <div className="flex items-center gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your name"
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 w-40"
          />
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 px-4 py-1.5 text-xs text-white"
          >
            {submitting ? "submitting…" : "Submit solution"}
          </button>
          {submissionId && (
            <span className="text-[11px] text-slate-500">
              ws: {stream.connection} ·{" "}
              <Link href={`/submissions/${submissionId}`} className="hover:text-slate-300 underline">
                permalink
              </Link>
            </span>
          )}
          {submitError && <span className="text-[11px] text-rose-400">{submitError}</span>}
        </div>
      </div>

      {/* Right: live results + separate review */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Status</span>
          <StatusBadge status={stream.status} />
          {!submissionId && <span className="text-xs text-slate-600">— submit to run</span>}
        </div>

        <TestResultsPanel
          cases={challenge.testCases}
          results={stream.testResults}
          status={stream.status}
          scorePct={stream.detail?.scorePct ?? null}
          testsPassed={stream.detail?.testsPassed ?? null}
          testsTotal={stream.detail?.testsTotal ?? null}
          runtimeMs={stream.detail?.runtimeMs ?? null}
        />

        <ReviewPanel review={stream.review} active={!!submissionId} />
      </div>
    </div>
  );
}
