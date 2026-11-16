"use client";

import { MoreHorizontal } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { StatusDot, STATUS_LABELS } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JOB_STATUSES, type JobStatus } from "@/lib/jobs/statuses";
import { setJobStatus } from "@/lib/jobs/actions";

/** Row menu on the jobs table for changing a job's status without opening it. */
export function RowStatusMenu({ jobId, status }: { jobId: number; status: JobStatus }) {
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Change status"
            className="relative z-10 text-muted-foreground hover:text-foreground"
            disabled={pending}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Set status</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={status}
            onValueChange={(next) => {
              if (next === status) return;
              startTransition(async () => {
                await setJobStatus(jobId, next as JobStatus);
                toast.success(`Marked as ${STATUS_LABELS[next as JobStatus].toLowerCase()}`);
              });
            }}
          >
            {JOB_STATUSES.map((s) => (
              <DropdownMenuRadioItem key={s} value={s}>
                <StatusDot status={s} />
                {STATUS_LABELS[s]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
