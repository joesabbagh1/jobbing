"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { isAiConfigured } from "@/lib/ai/deepseek";
import { refineSuggestion, suggestTailoring, type TailoringResult } from "@/lib/ai/suggest-tailoring";
import { localOrigin } from "@/lib/local-origin";
import { pdfToText, structureCv } from "./import";
import { measurePages } from "./pdf";
import { type Cv, cvSchema, EMPTY_CV, PAPER } from "./schema";
import {
  type CvTarget,
  deleteTailoredCv,
  getExperienceNotes,
  getMasterCv,
  getTailoredCv,
  saveCv,
  saveExperienceNotes,
} from "./store";
import type { Suggestion } from "./tailor";

export type ImportState = { error?: string };

export async function importCv(_: ImportState, formData: FormData): Promise<ImportState> {
  const file = formData.get("file");
  const pasted = String(formData.get("text") ?? "").trim();
  if (!isAiConfigured()) return { error: "Set DEEPSEEK_API_KEY in .env.local first." };

  let text = pasted;
  if (file instanceof File && file.size > 0) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return { error: "Upload a PDF, or paste the CV text instead." };
    }
    try {
      text = await pdfToText(new Uint8Array(await file.arrayBuffer()));
    } catch (err) {
      return { error: `Couldn't read the PDF: ${(err as Error).message}` };
    }
    if (text.length < 200) {
      return { error: "Found almost no text in that PDF (is it a scanned image?). Paste the CV text instead." };
    }
  }
  if (!text) return { error: "Choose a PDF or paste your CV text." };

  try {
    saveCv(getDb(), "master", await structureCv(text));
  } catch (err) {
    return { error: `AI parsing failed: ${(err as Error).message}` };
  }
  revalidatePath("/cv");
  return {};
}

export async function startBlankCv() {
  saveCv(getDb(), "master", EMPTY_CV);
  revalidatePath("/cv");
}

export async function saveCvAction(target: CvTarget, cv: Cv): Promise<{ savedAt?: string; error?: string }> {
  const parsed = cvSchema.safeParse(cv);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid CV" };
  saveCv(getDb(), target, parsed.data);
  return { savedAt: new Date().toISOString() };
}

/** Starts a job's tailored CV as a copy of the master. */
export async function createTailoredCv(jobId: number) {
  const db = getDb();
  const master = getMasterCv(db);
  if (!master) throw new Error("Create your master CV first.");
  saveCv(db, jobId, master);
  revalidatePath(`/jobs/${jobId}`);
}

/** Creates the tailored copy (if needed) and opens the editor with AI suggestions. */
export async function tailorWithAi(jobId: number) {
  const db = getDb();
  if (!getTailoredCv(db, jobId)) {
    const master = getMasterCv(db);
    if (!master) throw new Error("Create your master CV first.");
    saveCv(db, jobId, master);
  }
  redirect(`/jobs/${jobId}/cv?suggest`);
}

/** The job to tailor for, or why the AI can't be asked yet. */
function tailoringJob(jobId: number): { job: typeof jobs.$inferSelect & { description: string } } | { error: string } {
  const job = getDb().select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) return { error: "Job not found." };
  if (!job.description) return { error: "This job has no description yet. Paste it on the job page first." };
  if (!isAiConfigured()) return { error: "Set DEEPSEEK_API_KEY in .env.local first." };
  return { job: { ...job, description: job.description } };
}

export async function getTailoringSuggestions(
  jobId: number,
  cv: Cv,
  instructions = "",
): Promise<TailoringResult | { error: string }> {
  const found = tailoringJob(jobId);
  if ("error" in found) return found;
  const { job } = found;
  try {
    // Save what's on screen, then measure its real printed length so the AI knows how much to trim.
    const parsed = cvSchema.parse(cv);
    saveCv(getDb(), jobId, parsed);
    const paper = PAPER[parsed.paper];
    const pages = await measurePages(`${await localOrigin()}/print/cv/${jobId}`, paper.height - 2 * paper.margin).catch(
      () => undefined,
    );
    return await suggestTailoring({
      cv: parsed,
      jobTitle: job.title,
      company: job.company,
      description: job.description,
      pages,
      notes: getExperienceNotes(getDb()),
      instructions,
    });
  } catch (err) {
    return { error: `AI request failed: ${(err as Error).message}` };
  }
}

/** Reworks one suggestion following the user's comment on it. */
export async function refineTailoringSuggestion(
  jobId: number,
  cv: Cv,
  suggestion: Suggestion,
  comment: string,
): Promise<{ suggestion: Suggestion } | { error: string }> {
  if (!comment.trim()) return { error: "Write what you'd like changed." };
  const found = tailoringJob(jobId);
  if ("error" in found) return found;
  const { job } = found;
  try {
    return await refineSuggestion({
      cv: cvSchema.parse(cv),
      jobTitle: job.title,
      company: job.company,
      description: job.description,
      notes: getExperienceNotes(getDb()),
      suggestion,
      comment,
    });
  } catch (err) {
    return { error: `AI request failed: ${(err as Error).message}` };
  }
}

export type NotesState = { savedAt?: string; error?: string };

export async function saveNotesAction(_: NotesState, formData: FormData): Promise<NotesState> {
  saveExperienceNotes(getDb(), String(formData.get("notes") ?? "").trim());
  revalidatePath("/cv");
  return { savedAt: new Date().toISOString() };
}

/** Replaces a job's tailored CV with a fresh copy of the master and returns it. */
export async function resetTailoredCvToMaster(jobId: number): Promise<{ cv: Cv } | { error: string }> {
  const db = getDb();
  const master = getMasterCv(db);
  if (!master) return { error: "You don't have a master CV to reset to." };
  saveCv(db, jobId, master);
  revalidatePath(`/jobs/${jobId}`);
  return { cv: master };
}

export async function resetTailoredCv(jobId: number) {
  deleteTailoredCv(getDb(), jobId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/cv`);
}
