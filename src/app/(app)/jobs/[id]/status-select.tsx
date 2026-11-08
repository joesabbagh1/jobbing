"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { StatusDot, STATUS_LABELS } from "@/components/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JOB_STATUSES, type JobStatus } from "@/lib/jobs/statuses";
import { setJobStatus } from "@/lib/jobs/actions";

/** Status picker that saves immediately. */
export function StatusSelect({ jobId, status }: { jobId: number; status: JobStatus }) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      items={JOB_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
      value={status}
      onValueChange={(next) =>
        startTransition(async () => {
          await setJobStatus(jobId, next as JobStatus);
          toast.success(`Marked as ${STATUS_LABELS[next as JobStatus].toLowerCase()}`);
        })
      }
    >
      <SelectTrigger aria-label="Status" className="h-9 min-w-36 bg-background" disabled={pending}>
        <StatusDot status={status} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="end">
        {JOB_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            <StatusDot status={s} />
            {STATUS_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
