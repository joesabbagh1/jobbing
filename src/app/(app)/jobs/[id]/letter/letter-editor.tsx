"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CircleAlert, Download, Eye, Loader2, Sparkles } from "lucide-react";
import { AppSelect } from "@/components/app-select";
import { ConfirmAction } from "@/components/confirm-action";
import { AutoTextarea } from "@/components/cv-editor/fields";
import { LetterTemplate } from "@/components/letter-template";
import { ScaledPage } from "@/components/scaled-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Cv } from "@/lib/cv/schema";
import { generateLetter, saveLetterAction } from "@/lib/letter/actions";
import { letterWarnings } from "@/lib/letter/check";
import type { Letter } from "@/lib/letter/schema";
import { cn } from "@/lib/utils";

type SaveState = "saved" | "dirty" | "saving" | "error";

export function LetterEditor({
  jobId,
  initial,
  defaultLanguage,
  basics,
  company,
  vocabulary,
  autoGenerate,
}: {
  jobId: number;
  initial?: Letter;
  defaultLanguage: "en" | "fr";
  basics: Cv["basics"];
  company: string;
  /** Lowercased CV + profile + posting text, for live fact warnings. */
  vocabulary: string;
  autoGenerate?: boolean;
}) {
  const [letter, setLetter] = useState<Letter>(initial ?? { language: defaultLanguage, subject: "", body: "" });
  const [state, setState] = useState<SaveState>("saved");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [instructions, setInstructions] = useState("");
  const latest = useRef(letter);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    const snapshot = latest.current;
    setState("saving");
    const res = await saveLetterAction(jobId, snapshot);
    if (res.error) {
      setState("error");
      setError(res.error);
    } else {
      setState(latest.current === snapshot ? "saved" : "dirty");
    }
  }, [jobId]);

  const update = (next: Letter) => {
    setLetter(next);
    latest.current = next;
    setState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 800);
  };

  const generate = useCallback(
    async (language: "en" | "fr", extra?: string) => {
      setBusy(true);
      setError(undefined);
      const res = await generateLetter(jobId, { language, instructions: extra });
      setBusy(false);
      if ("error" in res) return setError(res.error);
      clearTimeout(timer.current);
      setLetter(res.letter);
      latest.current = res.letter;
      setState("saved");
    },
    [jobId],
  );

  const started = useRef(false);
  useEffect(() => {
    if (autoGenerate && !started.current) {
      started.current = true;
      window.history.replaceState(null, "", window.location.pathname);
      if (!initial?.body) void generate(defaultLanguage);
    }
  }, [autoGenerate, initial, defaultLanguage, generate]);

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (state === "dirty" || state === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [state]);

  const openPdf = async (download: boolean) => {
    await save();
    window.open(`/api/letter/${jobId}/pdf${download ? "?download" : ""}`, "_blank");
  };

  const warnings = letterWarnings(`${letter.subject}\n${letter.body}`, vocabulary);
  const words = letter.body.trim() ? letter.body.trim().split(/\s+/).length : 0;
  const hasLetter = Boolean(letter.body.trim());

  const writeButton = (onClick?: () => void) => (
    <Button disabled={busy} onClick={onClick} className="bg-violet-600 text-white hover:bg-violet-700">
      {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {busy ? "Writing…" : hasLetter ? "Rewrite with AI" : "Write with AI"}
    </Button>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={cn(
              "flex items-center gap-1.5 text-sm",
              state === "error" ? "text-destructive" : state === "dirty" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
            )}
          >
            {state === "saving" ? <Loader2 className="size-4 animate-spin" /> : state === "error" ? <CircleAlert className="size-4" /> : <Check className="size-4" />}
            {{ saved: hasLetter ? "All changes saved" : "No letter yet", dirty: "Unsaved changes", saving: "Saving…", error: `Save failed: ${error}` }[state]}
          </span>
          {hasLetter && (
            <div className="flex gap-2">
              <Button variant="outline" className="bg-background" onClick={() => openPdf(false)}>
                <Eye />
                Preview PDF
              </Button>
              <Button onClick={() => openPdf(true)}>
                <Download />
                Download
              </Button>
            </div>
          )}
        </div>

        <section className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <AppSelect
              aria-label="Letter language"
              value={letter.language}
              onValueChange={(v) => update({ ...letter, language: v as Letter["language"] })}
              options={[
                { value: "fr", label: "Français" },
                { value: "en", label: "English" },
              ]}
              className="min-w-28 bg-background"
            />
            <Input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Optional direction, e.g. shorter, mention my homelab…"
              className="min-w-48 flex-1 bg-background"
            />
            {hasLetter ? (
              <ConfirmAction
                title="Replace this letter?"
                description="A new draft replaces your current letter, including your edits."
                confirmLabel="Rewrite"
                destructive={false}
                onConfirm={() => generate(letter.language, instructions)}
                trigger={writeButton()}
              />
            ) : (
              writeButton(() => void generate(letter.language, instructions))
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Drafted from the posting, this job&apos;s CV and your profile. Facts must come from your CV; anything that
            doesn&apos;t is flagged below.
          </p>
          {error && state !== "error" && <p className="text-sm text-destructive">{error}</p>}
        </section>

        <div className="space-y-1.5">
          <Label className="text-xs font-normal text-muted-foreground">Subject</Label>
          <Input value={letter.subject} onChange={(e) => update({ ...letter, subject: e.target.value })} className="bg-background" />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label className="text-xs font-normal text-muted-foreground">Letter (blank line between paragraphs)</Label>
            <span className={cn("text-xs tabular-nums", words > 400 ? "text-amber-600" : "text-muted-foreground")}>{words} words</span>
          </div>
          <AutoTextarea
            value={letter.body}
            onChange={(body) => update({ ...letter, body })}
            className="min-h-80 bg-background leading-relaxed"
            placeholder="Write your letter, or let the AI draft it."
          />
        </div>
        {warnings.length > 0 && (
          <div className="flex gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Not found in your CV, profile or the posting: <strong>{warnings.join(", ")}</strong>. Make sure these are true
              before sending.
            </p>
          </div>
        )}
      </div>

      <ScaledPage>
        <LetterTemplate letter={letter} basics={basics} company={company} />
      </ScaledPage>
    </div>
  );
}
