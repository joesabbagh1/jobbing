import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { tailoredCvs } from "@/db/schema";
import { getSetting, setSetting } from "@/lib/settings";
import { type Cv, cvSchema } from "./schema";

const MASTER_KEY = "masterCv";
const NOTES_KEY = "experienceNotes";

/** "master" or a job id. */
export type CvTarget = "master" | number;

export function parseTarget(raw: string): CvTarget | null {
  if (raw === "master") return "master";
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function getMasterCv(db: Db): Cv | undefined {
  const raw = getSetting(db, MASTER_KEY);
  return raw ? cvSchema.parse(raw) : undefined;
}

export function getTailoredCv(db: Db, jobId: number): Cv | undefined {
  const row = db.select().from(tailoredCvs).where(eq(tailoredCvs.jobId, jobId)).get();
  return row ? cvSchema.parse(row.data) : undefined;
}

export function getCv(db: Db, target: CvTarget): Cv | undefined {
  return target === "master" ? getMasterCv(db) : getTailoredCv(db, target);
}

export function saveCv(db: Db, target: CvTarget, cv: Cv) {
  const data = cvSchema.parse(cv);
  if (target === "master") return setSetting(db, MASTER_KEY, data);
  db.insert(tailoredCvs)
    .values({ jobId: target, data })
    .onConflictDoUpdate({ target: tailoredCvs.jobId, set: { data, updatedAt: sql`CURRENT_TIMESTAMP` } })
    .run();
}

export function deleteTailoredCv(db: Db, jobId: number) {
  db.delete(tailoredCvs).where(eq(tailoredCvs.jobId, jobId)).run();
}

/** Free-form notes on everything the candidate worked on, which AI tailoring can draw from. */
export function getExperienceNotes(db: Db): string {
  return getSetting<string>(db, NOTES_KEY) ?? "";
}

export function saveExperienceNotes(db: Db, notes: string) {
  setSetting(db, NOTES_KEY, notes);
}
