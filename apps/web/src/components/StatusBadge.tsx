import type { SubmissionStatus } from "@codearena/shared";

const styles: Record<SubmissionStatus, string> = {
  queued: "bg-slate-700 text-slate-200",
  running: "bg-sky-900 text-sky-200 animate-pulse",
  passed: "bg-emerald-900 text-emerald-200",
  failed: "bg-rose-900 text-rose-200",
  error: "bg-amber-900 text-amber-200",
};

export function StatusBadge({ status }: { status: SubmissionStatus | null }): React.ReactNode {
  if (!status) return null;
  return (
    <span className={`px-2 py-0.5 rounded text-xs uppercase tracking-wide ${styles[status]}`}>
      {status}
    </span>
  );
}
