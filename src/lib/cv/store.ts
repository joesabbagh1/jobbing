import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { tailoredCvs } from "@/db/schema";
import { getSetting, setSetting } from "@/lib/settings";
import { CV_LANGUAGES, type Cv, type CvLanguage, cvSchema } from "./schema";

const masterKey = (language: CvLanguage) => `masterCv.${language}`;
const NOTES_KEY = "experienceNotes";

/** The master CV in one language ("master-fr", "master-en"), or a job id. */
export type MasterTarget = `master-${CvLanguage}`;
export type CvTarget = MasterTarget | number;

export const masterTarget = (language: CvLanguage): MasterTarget => `master-${language}`;

export function parseTarget(raw: string): CvTarget | null {
  const language = CV_LANGUAGES.find((l) => raw === masterTarget(l));
  if (language) return masterTarget(language);
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Validates a language coming from a form or URL. */
export function parseLanguage(raw: unknown): CvLanguage | undefined {
  return CV_LANGUAGES.find((l) => l === raw);
}

export function getMasterCv(db: Db, language: CvLanguage): Cv | undefined {
  const raw = getSetting(db, masterKey(language));
  return raw ? cvSchema.parse(raw) : undefined;
}

/** The languages that have a master CV. */
export function masterLanguages(db: Db): CvLanguage[] {
  return CV_LANGUAGES.filter((l) => getSetting(db, masterKey(l)) !== undefined);
}

/** The master CV in `preferred` if there is one, else the one in another language. */
export function pickMasterCv(db: Db, preferred?: CvLanguage): Cv | undefined {
  const order = preferred ? [preferred, ...CV_LANGUAGES.filter((l) => l !== preferred)] : CV_LANGUAGES;
  for (const language of order) {
    const cv = getMasterCv(db, language);
    if (cv) return cv;
  }
  return undefined;
}

export function getTailoredCv(db: Db, jobId: number): Cv | undefined {
  const row = db.select().from(tailoredCvs).where(eq(tailoredCvs.jobId, jobId)).get();
  return row ? cvSchema.parse(row.data) : undefined;
}

export function getCv(db: Db, target: CvTarget): Cv | undefined {
  return typeof target === "number" ? getTailoredCv(db, target) : getMasterCv(db, targetLanguage(target));
}

export function saveCv(db: Db, target: CvTarget, cv: Cv) {
  const data = cvSchema.parse(cv);
  if (typeof target !== "number") {
    // A master CV is stored under its language, so its content is always in that language.
    const language = targetLanguage(target);
    return setSetting(db, masterKey(language), { ...data, language });
  }
  db.insert(tailoredCvs)
    .values({ jobId: target, data })
    .onConflictDoUpdate({ target: tailoredCvs.jobId, set: { data, updatedAt: sql`CURRENT_TIMESTAMP` } })
    .run();
}

function targetLanguage(target: MasterTarget): CvLanguage {
  return target.slice("master-".length) as CvLanguage;
}

export function deleteTailoredCv(db: Db, jobId: number) {
  db.delete(tailoredCvs).where(eq(tailoredCvs.jobId, jobId)).run();
}

/** Free-form notes on everything the candidate worked on; cover letters are checked against them. */
export function getExperienceNotes(db: Db): string {
  return getSetting<string>(db, NOTES_KEY) ?? "";
}

export function saveExperienceNotes(db: Db, notes: string) {
  setSetting(db, NOTES_KEY, notes);
}
