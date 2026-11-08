"use client";

import { Check, Loader2, NotebookPen, Save } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveNotesAction } from "@/lib/cv/actions";
import { MAX_NOTES_CHARS } from "@/lib/cv/tailor";

export function NotesForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState(saveNotesAction, {});
  const [text, setText] = useState(initial);
  const dirty = text.trim() !== initial.trim();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <details open={!initial} className="group mb-6 rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <NotebookPen className="size-4 text-muted-foreground" />
        Experience notes
        <span className="font-normal text-muted-foreground">
          {initial ? `${words} words · used when the AI tailors your CV` : "empty"}
        </span>
      </summary>
      <form action={action} className="space-y-3 px-4 pb-4">
        <p className="text-xs text-muted-foreground">
          Write down everything you&apos;ve worked on, in any order and any language: each job in detail, side projects,
          tools, numbers, things too small for the CV. When you tailor a CV to a job, the AI can add bullets and projects
          from these notes, but only with facts written here.
        </p>
        <Textarea
          name="notes"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Faradae (2024–now): migrated 40 GCP projects to Terraform, set up ArgoCD…\n\nSide project: homelab k3s cluster with Cilium and Falco…"}
          className="min-h-72 font-mono text-xs"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pending || !dirty}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            Save notes
          </Button>
          {state.savedAt && !dirty && !pending && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="size-3.5" />
              Saved
            </span>
          )}
          {text.length > MAX_NOTES_CHARS && (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              Only the first {MAX_NOTES_CHARS.toLocaleString()} characters are sent to the AI.
            </span>
          )}
        </div>
      </form>
    </details>
  );
}
