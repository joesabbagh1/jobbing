import type { JobStatus } from "@/db/schema";
import { cn } from "@/lib/utils";

const DOT: Record<JobStatus, string> = {
  new: "bg-blue-500",
  reviewing: "bg-amber-500",
  ready: "bg-violet-500",
  applied: "bg-emerald-500",
  interview: "bg-teal-500",
  rejected: "bg-rose-500",
  skipped: "bg-zinc-400",
};

export const STATUS_LABELS: Record<JobStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  ready: "Ready",
  applied: "Applied",
  interview: "Interview",
  rejected: "Rejected",
  skipped: "Skipped",
};

export function StatusDot({ status, className }: { status: JobStatus; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", DOT[status], className)} />;
}

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs font-medium whitespace-nowrap">
      <StatusDot status={status} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ScoreBadge({ score, className }: { score: number | null; className?: string }) {
  if (score == null) return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  const tone =
    score >= 80
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : score >= 60
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums",
        tone,
        className,
      )}
    >
      {score}
    </span>
  );
}
