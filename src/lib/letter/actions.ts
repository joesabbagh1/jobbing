"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { type Letter, letterSchema } from "./schema";
import { deleteLetter, saveLetter } from "./store";

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
