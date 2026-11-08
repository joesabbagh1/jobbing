"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { isAiConfigured } from "@/lib/ai/deepseek";
import { writeCoverLetter } from "@/lib/ai/write-letter";
import { letterContext } from "./context";
import { detectLanguage, type Letter, letterSchema } from "./schema";
import { deleteLetter, saveLetter } from "./store";

/** From the job page: open the letter editor and draft one straight away. */
export async function writeLetterWithAi(jobId: number) {
  redirect(`/jobs/${jobId}/letter?generate`);
}

export async function generateLetter(
  jobId: number,
  opts: { language?: "en" | "fr"; instructions?: string } = {},
): Promise<{ letter: Letter } | { error: string }> {
  const db = getDb();
  const ctx = letterContext(db, jobId);
  if (!ctx) return { error: "Job not found." };
  if (!ctx.cv) return { error: "Import your CV first (My CV)." };
  if (!ctx.job.description) return { error: "This job has no description yet. Paste it on the job page first." };
  if (!isAiConfigured()) return { error: "Set DEEPSEEK_API_KEY in .env.local first." };

  try {
    const letter = await writeCoverLetter({
      language: opts.language ?? detectLanguage(ctx.job.description),
      cv: ctx.cv,
      profile: ctx.profile,
      jobTitle: ctx.job.title,
      company: ctx.job.company,
      description: ctx.job.description,
      instructions: opts.instructions,
    });
    saveLetter(db, jobId, letter);
    revalidatePath(`/jobs/${jobId}`);
    return { letter };
  } catch (err) {
    return { error: `AI request failed: ${(err as Error).message}` };
  }
}

export async function saveLetterAction(jobId: number, letter: Letter): Promise<{ error?: string }> {
  const parsed = letterSchema.safeParse(letter);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid letter" };
  saveLetter(getDb(), jobId, parsed.data);
  return {};
}

export async function deleteLetterAction(jobId: number) {
  deleteLetter(getDb(), jobId);
  revalidatePath(`/jobs/${jobId}`);
}
