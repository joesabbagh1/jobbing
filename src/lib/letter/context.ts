import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { jobs } from "@/db/schema";
import { CV_LANGUAGES, type Cv, type CvLanguage } from "@/lib/cv/schema";
import { getExperienceNotes, getMasterCv, getTailoredCv, pickMasterCv } from "@/lib/cv/store";
import { cvVocabulary } from "@/lib/cv/facts";
import { getSearchProfile } from "@/lib/search/profile";
import { detectLanguage } from "./schema";
import { getLetter } from "./store";

/**
 * The CV a letter in `language` goes with (its header and the facts it may state): the job's tailored CV when it's
 * in that language, else the master CV in that language, else whichever exists.
 */
export function letterCv(db: Db, jobId: number, language: CvLanguage): Cv | undefined {
  const tailored = getTailoredCv(db, jobId);
  if (tailored?.language === language) return tailored;
  return getMasterCv(db, language) ?? tailored ?? pickMasterCv(db);
}

/**
 * Everything a job's cover letter is written from: the job, the CV for it, the experience notes and the candidate
 * profile. The CV is the one in `language`, by default the saved letter's language or else the posting's.
 */
export function letterContext(db: Db, jobId: number, language?: CvLanguage) {
  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) return undefined;
  const lang = language ?? getLetter(db, jobId)?.language ?? detectLanguage(job.description ?? "");
  const cv = letterCv(db, jobId, lang);
  const profile = getSearchProfile(db).about;
  const notes = getExperienceNotes(db);
  // The same facts in every language the candidate has a CV in, so a letter in English isn't flagged for wording
  // that only the English CV uses.
  const cvs = [getTailoredCv(db, jobId), ...CV_LANGUAGES.map((l) => getMasterCv(db, l))].filter((c) => c !== undefined);
  // What the letter may draw on, lowercased; anything else gets flagged in the editor. Words that only the posting
  // uses are fine for describing the role, but not as the candidate's own experience.
  const vocabulary = {
    own: [...cvs.map(cvVocabulary), notes, profile, job.title, job.company].join("\n").toLowerCase(),
    posting: (job.description ?? "").toLowerCase(),
  };
  return { job, language: lang, cv, profile, notes, vocabulary };
}
