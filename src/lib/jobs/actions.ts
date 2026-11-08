"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { JOB_STATUSES, jobs } from "@/db/schema";
import { isAiConfigured } from "@/lib/ai/deepseek";
import { syncAirtable } from "@/lib/airtable/sync";
import { rescoreJob } from "@/lib/search/run";
import { enrichJob, enrichPending } from "./description/enrich";

export async function syncNow() {
  const db = getDb();
  await syncAirtable(db);
  // Descriptions can take a while; they show up on the next page load.
  void enrichPending(db);
  revalidatePath("/");
}

export async function refetchDescription(id: number) {
  await enrichJob(getDb(), id);
  revalidatePath("/");
  revalidatePath(`/jobs/${id}`);
}

const updateSchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  notes: z.string().optional(),
  description: z.string().optional(),
});

export async function updateJob(id: number, formData: FormData) {
  const fields = updateSchema.parse(
    Object.fromEntries(
      [...formData.entries()].filter(([k, v]) => k in updateSchema.shape && typeof v === "string"),
    ),
  );
  const db = getDb();
  const description = fields.description?.trim() || null;
  const descriptionChanged =
    fields.description !== undefined &&
    description !== (db.select({ d: jobs.description }).from(jobs).where(eq(jobs.id, id)).get()?.d ?? null);
  const patch = {
    ...fields,
    ...(fields.notes !== undefined && { notes: fields.notes.trim() || null }),
    ...(fields.description !== undefined && {
      description,
      descriptionSource: "manual",
      descriptionError: null,
    }),
    // The old score was judged on other text (or the Airtable notes), so it's dropped and redone.
    ...(descriptionChanged && { matchScore: null, analysis: null }),
  };
  if (Object.keys(patch).length === 0) return;

  db.update(jobs)
    .set({ ...patch, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(jobs.id, id))
    .run();
  revalidatePath("/");
  revalidatePath(`/jobs/${id}`);

  // Scoring takes a few seconds; the new score shows on the next page load. If it fails, the next
  // Airtable sync or search run picks the job up again since it has no score.
  if (descriptionChanged && isAiConfigured()) {
    void rescoreJob(db, id).catch((err) => console.error(`[score] rescoring #${id} failed: ${(err as Error).message}`));
  }
}

export async function setJobStatus(id: number, status: (typeof JOB_STATUSES)[number]) {
  if (!JOB_STATUSES.includes(status)) return;
  getDb().update(jobs).set({ status, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(jobs.id, id)).run();
  revalidatePath("/");
  revalidatePath(`/jobs/${id}`);
}
