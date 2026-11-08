"use client";

import {
  AlertTriangle,
  Check,
  CheckCheck,
  CheckCircle2,
  Lightbulb,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TailoringResult } from "@/lib/ai/suggest-tailoring";
import { getTailoringSuggestions } from "@/lib/cv/actions";
import type { Cv } from "@/lib/cv/schema";
import { applyOperation, type Suggestion } from "@/lib/cv/tailor";

type Decision = "accepted" | "dismissed";

const OP_LABEL: Record<Suggestion["op"], string> = {
  rewrite: "Reword",
  hide: "Hide",
  show: "Show",
  move: "Move",
  reorder: "Reorder",
  add: "Add bullet",
  addProject: "Add project",
};

export function SuggestionsPanel({
  jobId,
  cv,
  onChange,
  autoStart,
}: {
  jobId: number;
  cv: Cv;
  onChange: (cv: Cv) => void;
  autoStart?: boolean;
}) {
  const [result, setResult] = useState<TailoringResult>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const cvRef = useRef(cv);
  cvRef.current = cv;

  const generate = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const res = await getTailoringSuggestions(jobId, cvRef.current);
    setLoading(false);
    if ("error" in res) return setError(res.error);
    setResult(res);
    setDecisions({});
  }, [jobId]);

  const started = useRef(false);
  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void generate();
      // Drop ?suggest so a reload doesn't re-run it.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [autoStart, generate]);

  const pending = result?.suggestions.filter((s) => !decisions[s.key]) ?? [];

  const accept = (items: Suggestion[]) => {
    onChange(items.reduce((acc, s) => applyOperation(acc, s), cvRef.current));
    setDecisions((d) => ({ ...d, ...Object.fromEntries(items.map((s) => [s.key, "accepted" as const])) }));
  };

  return (
    <section className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-violet-600 dark:text-violet-400" />
          AI suggestions
          {result && (
            <span className="font-normal text-muted-foreground">
              {pending.length} of {result.suggestions.length} to review
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          {pending.length > 1 && (
            <Button size="sm" onClick={() => accept(pending)} className="bg-violet-600 text-white hover:bg-violet-700">
              <CheckCheck />
              Accept all
            </Button>
          )}
          <Button size="sm" variant="outline" className="bg-background" onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : result ? <RefreshCw /> : <Wand2 />}
            {loading ? "Thinking…" : result ? "Regenerate" : "Suggest edits for this job"}
          </Button>
        </div>
      </div>

      {!result && !loading && !error && (
        <p className="mt-2 text-xs text-muted-foreground">
          DeepSeek reads the job posting and proposes edits you accept or dismiss one by one. It can hide, reorder or
          reword what&apos;s in your CV, and add bullets or projects from your experience notes (My CV page). Numbers
          that aren&apos;t in your CV or notes are blocked.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {result && (
        <div className="mt-4 space-y-2">
          {result.advice && (
            <div className="flex gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              <Lightbulb className="mt-0.5 size-4 shrink-0" />
              <p>{result.advice}</p>
            </div>
          )}
          {result.suggestions.length === 0 && (
            <p className="text-sm text-muted-foreground">No changes suggested: your CV already fits.</p>
          )}
          {result.suggestions.map((s) => (
            <SuggestionCard
              key={s.key}
              s={s}
              decision={decisions[s.key]}
              onAccept={() => accept([s])}
              onDismiss={() => setDecisions((d) => ({ ...d, [s.key]: "dismissed" }))}
            />
          ))}
          {result.rejected.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
                <ShieldCheck className="size-3.5" />
                {result.rejected.length} suggestion{result.rejected.length > 1 ? "s" : ""} blocked by safety checks
              </summary>
              <ul className="mt-1 list-disc pl-5">
                {result.rejected.map((r, i) => (
                  <li key={i}>{r.why}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function SuggestionCard({
  s,
  decision,
  onAccept,
  onDismiss,
}: {
  s: Suggestion;
  decision?: Decision;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  if (decision) {
    return (
      <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        {decision === "accepted" ? (
          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <XCircle className="size-3.5" />
        )}
        <span className="font-medium">{decision === "accepted" ? "Applied" : "Dismissed"}</span>
        {OP_LABEL[s.op]} · {s.target}
      </p>
    );
  }
  return (
    <div className="rounded-lg border bg-background p-3 text-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary" className="bg-violet-500/15 text-violet-700 dark:text-violet-300">
            {OP_LABEL[s.op]}
          </Badge>
          <span className="truncate font-medium">{s.target}</span>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="xs" variant="ghost" onClick={onDismiss} className="text-muted-foreground">
            Dismiss
          </Button>
          <Button size="xs" onClick={onAccept}>
            <Check />
            Accept
          </Button>
        </div>
      </div>

      {s.op === "rewrite" && (
        <div className="space-y-1 text-xs">
          <p className="rounded-md bg-rose-500/10 px-2 py-1.5 text-rose-900 line-through decoration-rose-400/60 dark:text-rose-200">{s.before}</p>
          <p className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-emerald-900 dark:text-emerald-200">{s.text}</p>
        </div>
      )}
      {s.op === "add" && (
        <p className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-900 dark:text-emerald-200">{s.text}</p>
      )}
      {s.op === "addProject" && (
        <div className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-900 dark:text-emerald-200">
          <p>
            <strong>{s.name}</strong>
            {s.description && `: ${s.description}`}
          </p>
          {s.bullets.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {s.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {s.warnings.length > 0 && (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          Not found in your CV or notes: <strong>{s.warnings.join(", ")}</strong>. Only accept if it&apos;s true.
        </p>
      )}
      {(s.op === "hide" || s.op === "show") && <p className="text-xs text-muted-foreground">{s.before}</p>}
      {s.op === "reorder" && (
        <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
          {s.orderPreview?.map((t, i) => (
            <li key={i} className="truncate">
              {t}
            </li>
          ))}
        </ol>
      )}
      {s.reason && <p className="mt-2 text-xs text-muted-foreground italic">{s.reason}</p>}
    </div>
  );
}
