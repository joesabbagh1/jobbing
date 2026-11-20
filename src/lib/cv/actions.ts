"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { type Cv, type CvLanguage, cvSchema, EMPTY_CV, LANGUAGE_NAMES } from "./schema";
import {
  type CvTarget,
  deleteTailoredCv,
  getMasterCv,
  getTailoredCv,
  masterTarget,
  parseLanguage,
  pickMasterCv,
  saveCv,
  saveExperienceNotes,
} from "./store";

export async function startBlankCv(language: CvLanguage) {
  saveCv(getDb(), masterTarget(language), EMPTY_CV);
  revalidatePath("/cv");
}

/** Starts the master CV in `language` as a copy of the one in `from`, to translate in the editor. */
export async function copyMasterCv(from: CvLanguage, language: CvLanguage) {
  const db = getDb();
  const source = getMasterCv(db, from);
  if (!source) throw new Error(`You don't have a ${LANGUAGE_NAMES[from]} CV to copy.`);
  saveCv(db, masterTarget(language), source);
  revalidatePath("/cv");
}

export async function saveCvAction(target: CvTarget, cv: Cv): Promise<{ savedAt?: string; error?: string }> {
  const parsed = cvSchema.safeParse(cv);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid CV" };
  saveCv(getDb(), target, parsed.data);
  return { savedAt: new Date().toISOString() };
}

/** Starts a job's tailored CV as a copy of the master in the form's language (or the only master there is). */
export async function createTailoredCv(jobId: number, formData?: FormData) {
  const db = getDb();
  const master = pickMasterCv(db, parseLanguage(formData?.get("language")));
  if (!master) throw new Error("Create your master CV first.");
  saveCv(db, jobId, master);
  revalidatePath(`/jobs/${jobId}`);
}

export type NotesState = { savedAt?: string; error?: string };

export async function saveNotesAction(_: NotesState, formData: FormData): Promise<NotesState> {
  saveExperienceNotes(getDb(), String(formData.get("notes") ?? "").trim());
  revalidatePath("/cv");
  return { savedAt: new Date().toISOString() };
}

/**
 * Replaces a job's tailored CV with a fresh copy of a master CV and returns it: the one in `language`, or by default
 * the one in the tailored CV's current language.
 */
export async function resetTailoredCvToMaster(jobId: number, language?: CvLanguage): Promise<{ cv: Cv } | { error: string }> {
  const db = getDb();
  const master = language ? getMasterCv(db, language) : pickMasterCv(db, getTailoredCv(db, jobId)?.language);
  if (!master) return { error: `You don't have a ${language ? `${LANGUAGE_NAMES[language]} ` : ""}master CV to reset to.` };
  saveCv(db, jobId, master);
  revalidatePath(`/jobs/${jobId}`);
  return { cv: master };
}

export async function resetTailoredCv(jobId: number) {
  deleteTailoredCv(getDb(), jobId);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/cv`);
}
