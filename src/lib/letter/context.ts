import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { jobs } from "@/db/schema";
import { getMasterCv, getTailoredCv } from "@/lib/cv/store";
import { cvVocabulary } from "@/lib/cv/tailor";
import { getSearchProfile } from "@/lib/search/profile";

/** Everything a job's cover letter is written from: the job, the CV for it, and the candidate profile. */
export function letterContext(db: Db, jobId: number) {
  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) return undefined;
  const cv = getTailoredCv(db, jobId) ?? getMasterCv(db);
  const profile = getSearchProfile(db).about;
  // What the letter may draw on; anything else gets flagged in the editor.
  const vocabulary = [cv ? cvVocabulary(cv) : "", profile, job.description ?? "", job.title, job.company]
    .join("\n")
    .toLowerCase();
  return { job, cv, profile, vocabulary };
}
