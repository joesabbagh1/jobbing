import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { coverLetters } from "@/db/schema";
import { type Letter, letterSchema } from "./schema";

export function getLetter(db: Db, jobId: number): Letter | undefined {
  const row = db.select().from(coverLetters).where(eq(coverLetters.jobId, jobId)).get();
  return row ? letterSchema.parse(row.data) : undefined;
}

export function saveLetter(db: Db, jobId: number, letter: Letter) {
  const data = letterSchema.parse(letter);
  db.insert(coverLetters)
    .values({ jobId, data })
    .onConflictDoUpdate({ target: coverLetters.jobId, set: { data, updatedAt: sql`CURRENT_TIMESTAMP` } })
    .run();
}

export function deleteLetter(db: Db, jobId: number) {
  db.delete(coverLetters).where(eq(coverLetters.jobId, jobId)).run();
}
