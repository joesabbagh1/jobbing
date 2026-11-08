"use client";

import { BellRing, CheckCircle2, FileText, FileUser, Send, Undo2 } from "lucide-react";
import { useActionState } from "react";
import { AppSelect } from "@/components/app-select";
import { ConfirmAction } from "@/components/confirm-action";
import { DatePicker } from "@/components/date-picker";
import { SubmitButton } from "@/components/submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { type ApplyState, markApplied, undoApplied, updateFollowUp } from "@/lib/apply/actions";
import { APPLY_CHANNELS } from "@/lib/apply/channels";
import { cn } from "@/lib/utils";

export type AppliedSummary = {
  appliedAt: string;
  via: string;
  notes: string | null;
  followUpOn: string | null;
  hasLetter: boolean;
};

const CHANNEL_LABELS: Record<(typeof APPLY_CHANNELS)[number], string> = {
  "company site": "Company site",
  LinkedIn: "LinkedIn",
  "job board": "Job board",
  email: "Email",
  referral: "Referral",
  other: "Other",
};

export function ApplyCard({
  jobId,
  ready,
  documents,
  defaultFollowUp,
  today,
  applied,
}: {
  jobId: number;
  /** A CV exists, so the job can be marked applied. */
  ready: boolean;
  /** The CV and cover letter rows (status and actions). */
  documents: React.ReactNode;
  defaultFollowUp: string;
  today: string;
  applied?: AppliedSummary;
}) {
  const [state, action] = useActionState<ApplyState, FormData>(markApplied.bind(null, jobId), {});

  if (applied) {
    const due = Boolean(applied.followUpOn && applied.followUpOn <= today);
    return (
      <Card className="ring-emerald-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-5" />
            Applied
          </CardTitle>
          <CardDescription>
            {new Date(applied.appliedAt.replace(" ", "T") + "Z").toLocaleDateString(undefined, { dateStyle: "medium" })} via{" "}
            {CHANNEL_LABELS[applied.via as keyof typeof CHANNEL_LABELS] ?? applied.via}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {applied.notes && <p className="text-muted-foreground">{applied.notes}</p>}
          <div className="flex flex-wrap gap-2">
            <a href={`/api/applications/${jobId}/cv`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileUser />
              CV sent
            </a>
            {applied.hasLetter && (
              <a href={`/api/applications/${jobId}/letter`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <FileText />
                Letter sent
              </a>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className={cn(due && "text-amber-700 dark:text-amber-400")}>
              <BellRing className="size-3.5" />
              {due ? "Follow up now" : "Follow up on"}
            </Label>
            <DatePicker
              defaultValue={applied.followUpOn ?? ""}
              placeholder="No reminder"
              onChange={(v) => {
                const fd = new FormData();
                fd.set("followUpOn", v);
                void updateFollowUp(jobId, fd);
              }}
            />
          </div>
          <Separator />
          <ConfirmAction
            title="Remove this application?"
            description="The record and the copies of the CV and letter you sent are deleted, and the job goes back to Ready."
            confirmLabel="Remove"
            onConfirm={() => undoApplied(jobId)}
            trigger={
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <Undo2 />
                Undo (marked by mistake)
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="ring-2 ring-primary/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="size-4" />
          Apply
        </CardTitle>
        <CardDescription>Prepare your documents, apply on their site, then record it here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y">{documents}</div>

        {ready && (
          <>
            <Separator />

            <form action={action} className="space-y-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">After submitting</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Applied via</Label>
                  <AppSelect
                    name="via"
                    defaultValue="company site"
                    options={APPLY_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Follow up on</Label>
                  <DatePicker name="followUpOn" defaultValue={defaultFollowUp} placeholder="No reminder" />
                </div>
              </div>
              <Input name="notes" placeholder="Notes (optional), e.g. referral from…" />
              <SubmitButton className="w-full bg-emerald-600 text-white hover:bg-emerald-700" pendingLabel="Saving a copy of what you sent…">
                <CheckCircle2 />
                Mark as applied
              </SubmitButton>
              {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
