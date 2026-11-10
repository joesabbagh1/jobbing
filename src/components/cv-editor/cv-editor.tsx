"use client";

import { Check, Circle, CircleAlert, Download, Eye, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmAction } from "@/components/confirm-action";
import { CvTemplate } from "@/components/cv-template";
import { AppSelect } from "@/components/app-select";
import { ScaledPage } from "@/components/scaled-page";
import { Button } from "@/components/ui/button";
import { resetTailoredCvToMaster, saveCvAction } from "@/lib/cv/actions";
import { type Cv, newId, PAPER } from "@/lib/cv/schema";
import type { CvTarget } from "@/lib/cv/store";
import { Field } from "./fields";
import { BasicsEditor, BulletsEditor, ListSection } from "./sections";
import { SuggestionsPanel } from "./suggestions-panel";

type SaveState = "saved" | "dirty" | "saving" | "error";

export function CvEditor({
  initial,
  target,
  aside,
  autoSuggest,
}: {
  initial: Cv;
  target: CvTarget;
  /** Extra panel above the form, e.g. the job description when tailoring. */
  aside?: React.ReactNode;
  /** For a job's CV: fetch AI suggestions as soon as the editor opens. */
  autoSuggest?: boolean;
}) {
  const [cv, setCv] = useState(initial);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<string>();
  const latest = useRef(cv);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Saves whatever is current; if edits arrived meanwhile, stay "dirty" (their timer saves them).
  const save = useCallback(async () => {
    clearTimeout(timer.current);
    const snapshot = latest.current;
    setState("saving");
    const res = await saveCvAction(target, snapshot);
    if (res.error) {
      setState("error");
      setError(res.error);
    } else {
      setState(latest.current === snapshot ? "saved" : "dirty");
      setError(undefined);
    }
  }, [target]);

  // Autosave 800ms after the last edit.
  const update = useCallback(
    (next: Cv) => {
      setCv(next);
      latest.current = next;
      setState("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), 800);
    },
    [save],
  );

  // Warn before leaving with unsaved edits; Cmd/Ctrl+S saves immediately.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (state === "dirty" || state === "saving") e.preventDefault();
    };
    const keydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", keydown);
    };
  }, [state, save]);

  const openPdf = async (download: boolean) => {
    await save();
    window.open(`/api/cv/${target}/pdf${download ? "?download" : ""}`, "_blank");
  };

  // Bumped on reset so the suggestions panel starts fresh (old suggestions refer to the discarded edits).
  const [resets, setResets] = useState(0);
  const resetToMaster = async () => {
    if (target === "master") return;
    clearTimeout(timer.current);
    const res = await resetTailoredCvToMaster(target);
    if ("error" in res) {
      setState("error");
      setError(res.error);
      return;
    }
    setCv(res.cv);
    latest.current = res.cv;
    setState("saved");
    setError(undefined);
    setResets((n) => n + 1);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <SaveIndicator state={state} error={error} />
        <div className="flex items-center gap-2">
          {target !== "master" && (
            <ConfirmAction
              title="Reset to your master CV?"
              description="All edits you made to this job's CV are replaced with a fresh copy of your master CV. This can't be undone."
              confirmLabel="Reset"
              onConfirm={resetToMaster}
              trigger={
                <Button type="button" variant="outline" className="bg-background">
                  <RotateCcw />
                  Reset
                </Button>
              }
            />
          )}
          <AppSelect
            aria-label="Section heading language"
            value={cv.language}
            onValueChange={(v) => update({ ...cv, language: v as Cv["language"] })}
            options={[
              { value: "en", label: "English headings" },
              { value: "fr", label: "Titres en français" },
            ]}
            className="bg-background"
          />
          <AppSelect
            aria-label="Paper size"
            value={cv.paper}
            onValueChange={(v) => update({ ...cv, paper: v as Cv["paper"] })}
            options={[
              { value: "letter", label: "US Letter" },
              { value: "a4", label: "A4" },
            ]}
            className="min-w-28 bg-background"
          />
          <Button type="button" variant="outline" className="bg-background" onClick={() => openPdf(false)}>
            <Eye />
            Preview PDF
          </Button>
          <Button type="button" onClick={() => openPdf(true)}>
            <Download />
            Download
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3 pb-8">
          {target !== "master" && (
            <SuggestionsPanel
              key={resets}
              jobId={target}
              cv={cv}
              onChange={update}
              autoStart={autoSuggest && resets === 0}
            />
          )}

          {aside && <div>{aside}</div>}

          <BasicsEditor cv={cv} set={update} />

          <ListSection
            title="Experience"
            addLabel="Experience"
            items={cv.experience}
            onChange={(experience) => update({ ...cv, experience })}
            make={() => ({ id: newId(), company: "", url: "", role: "", location: "", start: "", end: "", bullets: [], hidden: false })}
            label={(e) => [e.role, e.company].filter(Boolean).join(" · ")}
            render={(e, set) => (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Role" value={e.role} onChange={(role) => set({ role })} />
                  <Field label="Company" value={e.company} onChange={(company) => set({ company })} />
                  <Field label="Start" value={e.start} onChange={(start) => set({ start })} placeholder="Jan 2023" />
                  <Field label="End" value={e.end} onChange={(end) => set({ end })} placeholder="Present" />
                  <Field label="Location" value={e.location} onChange={(location) => set({ location })} />
                  <Field label="Company link" value={e.url} onChange={(url) => set({ url })} placeholder="https://…" />
                </div>
                <BulletsEditor bullets={e.bullets} onChange={(bullets) => set({ bullets })} />
              </>
            )}
          />

          <ListSection
            title="Projects"
            addLabel="Project"
            items={cv.projects}
            defaultOpen={cv.projects.length > 0}
            onChange={(projects) => update({ ...cv, projects })}
            make={() => ({ id: newId(), name: "", url: "", description: "", bullets: [], hidden: false })}
            label={(p) => p.name}
            render={(p, set) => (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Name" value={p.name} onChange={(name) => set({ name })} />
                  <Field label="URL" value={p.url} onChange={(url) => set({ url })} />
                </div>
                <Field label="Description" multiline value={p.description} onChange={(description) => set({ description })} className="mt-2" />
                <BulletsEditor bullets={p.bullets} onChange={(bullets) => set({ bullets })} />
              </>
            )}
          />

          <ListSection
            title="Education"
            addLabel="Education"
            items={cv.education}
            onChange={(education) => update({ ...cv, education })}
            make={() => ({ id: newId(), school: "", degree: "", location: "", start: "", end: "", details: "", hidden: false })}
            label={(e) => [e.degree, e.school].filter(Boolean).join(" · ")}
            render={(e, set) => (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Degree" value={e.degree} onChange={(degree) => set({ degree })} />
                <Field label="School" value={e.school} onChange={(school) => set({ school })} />
                <Field label="Start" value={e.start} onChange={(start) => set({ start })} />
                <Field label="End" value={e.end} onChange={(end) => set({ end })} />
                <Field label="Location" value={e.location} onChange={(location) => set({ location })} />
                <Field label="Details" multiline value={e.details} onChange={(details) => set({ details })} className="col-span-2" />
              </div>
            )}
          />

          <ListSection
            title="Skills"
            addLabel="Skill group"
            items={cv.skills}
            onChange={(skills) => update({ ...cv, skills })}
            make={() => ({ id: newId(), category: "", items: "", hidden: false })}
            label={(s) => s.category || s.items.slice(0, 40)}
            render={(s, set) => (
              <div className="grid grid-cols-[1fr_2fr] gap-2">
                <Field label="Category" value={s.category} onChange={(category) => set({ category })} placeholder="Cloud" />
                <Field label="Items (comma-separated)" multiline value={s.items} onChange={(items) => set({ items })} />
              </div>
            )}
          />

          <ListSection
            title="Certifications"
            addLabel="Certification"
            items={cv.certifications}
            defaultOpen={cv.certifications.length > 0}
            onChange={(certifications) => update({ ...cv, certifications })}
            make={() => ({ id: newId(), name: "", detail: "", hidden: false })}
            label={(c) => c.name}
            render={(c, set) => (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Name" value={c.name} onChange={(name) => set({ name })} />
                <Field label="Issuer / date" value={c.detail} onChange={(detail) => set({ detail })} />
              </div>
            )}
          />

          <ListSection
            title="Languages"
            addLabel="Language"
            items={cv.languages}
            defaultOpen={cv.languages.length > 0}
            onChange={(languages) => update({ ...cv, languages })}
            make={() => ({ id: newId(), name: "", detail: "", hidden: false })}
            label={(l) => l.name}
            render={(l, set) => (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Language" value={l.name} onChange={(name) => set({ name })} />
                <Field label="Level" value={l.detail} onChange={(detail) => set({ detail })} placeholder="Native, C1…" />
              </div>
            )}
          />

          <ListSection
            title="Interests"
            addLabel="Interest"
            items={cv.interests}
            defaultOpen={cv.interests.length > 0}
            onChange={(interests) => update({ ...cv, interests })}
            make={() => ({ id: newId(), name: "", detail: "", hidden: false })}
            label={(i) => i.name}
            render={(i, set) => (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Interest" value={i.name} onChange={(name) => set({ name })} />
                <Field label="Detail" value={i.detail} onChange={(detail) => set({ detail })} />
              </div>
            )}
          />
        </div>

        <ScaledPage widthMm={PAPER[cv.paper].width} heightMm={PAPER[cv.paper].height} marginMm={PAPER[cv.paper].margin}>
          <CvTemplate cv={cv} />
        </ScaledPage>
      </div>
    </div>
  );
}

function SaveIndicator({ state, error }: { state: SaveState; error?: string }) {
  const map = {
    saved: { icon: <Check className="size-4" />, text: "All changes saved", tone: "text-muted-foreground" },
    dirty: { icon: <Circle className="size-3 fill-current" />, text: "Unsaved changes", tone: "text-amber-600 dark:text-amber-400" },
    saving: { icon: <Loader2 className="size-4 animate-spin" />, text: "Saving…", tone: "text-muted-foreground" },
    error: { icon: <CircleAlert className="size-4" />, text: `Save failed: ${error}`, tone: "text-destructive" },
  }[state];
  return (
    <span className={`flex items-center gap-1.5 text-sm ${map.tone}`}>
      {map.icon}
      {map.text}
    </span>
  );
}
