"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CircleAlert, Download, Eye, Loader2 } from "lucide-react";
import { AppSelect } from "@/components/app-select";
import { CopyTextButton } from "@/components/copy-text-button";
import { AutoTextarea } from "@/components/cv-editor/fields";
import { LetterTemplate } from "@/components/letter-template";
import { ScaledPage } from "@/components/scaled-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Cv } from "@/lib/cv/schema";
import { saveLetterAction } from "@/lib/letter/actions";
import { type LetterVocabulary, letterWarnings } from "@/lib/letter/check";
import { type Letter, letterPlainText } from "@/lib/letter/schema";
import { cn } from "@/lib/utils";

type SaveState = "saved" | "dirty" | "saving" | "error";

export function LetterEditor({
  jobId,
  initial,
  defaultLanguage,
  basics,
  company,
  vocabulary,
}: {
  jobId: number;
  initial?: Letter;
  defaultLanguage: "en" | "fr";
  /** The letter header for each language, from the CV in that language. */
  basics: Record<Letter["language"], Cv["basics"]>;
  company: string;
  /** What the letter may draw on, for live fact warnings. */
  vocabulary: LetterVocabulary;
}) {
  const [letter, setLetter] = useState<Letter>(initial ?? { language: defaultLanguage, subject: "", body: "" });
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<string>();
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
              <CopyTextButton size="default" text={letterPlainText(letter, basics[letter.language]?.name)} />
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
          <p className="text-xs text-muted-foreground">
            Facts must come from your CV or notes; anything that doesn&apos;t is flagged below.
          </p>
        </div>

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
            placeholder="Write your letter."
          />
        </div>
        {(warnings.unknown.length > 0 || warnings.fromPosting.length > 0) && (
          <div className="flex gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              {warnings.unknown.length > 0 && (
                <p>
                  Not found in your CV, notes, profile or the posting: <strong>{warnings.unknown.join(", ")}</strong>.
                  Make sure these are true before sending.
                </p>
              )}
              {warnings.fromPosting.length > 0 && (
                <p>
                  Only in the posting, not in your CV or notes: <strong>{warnings.fromPosting.join(", ")}</strong>. Fine
                  when describing the role, not as your own experience.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <ScaledPage>
        <LetterTemplate letter={letter} basics={basics[letter.language]} company={company} />
      </ScaledPage>
    </div>
  );
}
