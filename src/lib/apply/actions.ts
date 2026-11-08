"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { applications, jobs } from "@/db/schema";
import { APPLY_CHANNELS } from "./channels";
import { renderPdf } from "@/lib/cv/pdf";
import { getMasterCv, getTailoredCv } from "@/lib/cv/store";
import { documentFilename } from "@/lib/filename";
import { getLetter } from "@/lib/letter/store";
import { localOrigin } from "@/lib/local-origin";

export type ApplyState = { error?: string };

const formSchema = z.object({
  via: z.enum(APPLY_CHANNELS),
  followUpOn: z.iso.date().or(z.literal("")),
  notes: z.string().trim(),
});

/** Freezes what's being sent (content + rendered PDFs) and marks the job applied. */
export async function markApplied(jobId: number, _: ApplyState, formData: FormData): Promise<ApplyState> {
  const parsed = formSchema.safeParse({
    via: formData.get("via"),
    followUpOn: formData.get("followUpOn") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: "Check the form fields." };

  const db = getDb();
  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) return { error: "Job not found." };
  const tailored = getTailoredCv(db, jobId);
  const cv = tailored ?? getMasterCv(db);
  if (!cv) return { error: "Import your CV first." };
  const letter = getLetter(db, jobId);
  const hasLetter = Boolean(letter?.body.trim());

  try {
    const origin = await localOrigin();
    const [cvPdf, letterPdf] = await Promise.all([
      renderPdf(`${origin}/print/cv/${tailored ? jobId : "master"}`),
      hasLetter ? renderPdf(`${origin}/print/letter/${jobId}`) : Promise.resolve(null),
    ]);
    const letterKind = letter?.language === "fr" ? "Lettre_de_motivation" : "Cover_Letter";

    db.transaction((tx) => {
      tx.insert(applications)
        .values({
          jobId,
          via: parsed.data.via,
          notes: parsed.data.notes || null,
          followUpOn: parsed.data.followUpOn || null,
          cv,
          letter: hasLetter ? letter : null,
          cvPdf,
          cvFilename: documentFilename(cv.basics.name, "CV", job.company),
          letterPdf,
          letterFilename: hasLetter ? documentFilename(cv.basics.name, letterKind, job.company) : null,
        })
        .onConflictDoNothing()
        .run();
      tx.update(jobs).set({ status: "applied" }).where(eq(jobs.id, jobId)).run();
    });
  } catch (err) {
    return { error: `Couldn't save the application: ${(err as Error).message}` };
  }
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
  return {};
}

/** Removes the application record (e.g. marked by mistake) and puts the job back to "ready". */
export async function undoApplied(jobId: number) {
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(applications).where(eq(applications.jobId, jobId)).run();
    tx.update(jobs).set({ status: "ready" }).where(eq(jobs.id, jobId)).run();
  });
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
}

export async function updateFollowUp(jobId: number, formData: FormData) {
  const date = String(formData.get("followUpOn") ?? "");
  getDb()
    .update(applications)
    .set({ followUpOn: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null })
    .where(eq(applications.jobId, jobId))
    .run();
  revalidatePath("/");
  revalidatePath(`/jobs/${jobId}`);
}
