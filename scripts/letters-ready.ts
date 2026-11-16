/**
 * Drafts a cover letter for every "ready" job at or above a match score that doesn't have one yet. CVs aren't tailored:
 * every application sends the master CV in the posting's language. Safe to re-run: jobs with a letter are skipped.
 *
 *   npm run letters:ready -- [minScore=80]
 */
import { config } from "dotenv";
import { and, eq, gte } from "drizzle-orm";
import { createDb, type Db } from "../src/db";
import { jobs } from "../src/db/schema";
import { writeCoverLetter } from "../src/lib/ai/write-letter";
import { thinPostingWarning } from "../src/lib/jobs/description/quality";
import { letterContext } from "../src/lib/letter/context";
import { getLetter, saveLetter } from "../src/lib/letter/store";

config({ path: [".env.local", ".env"], quiet: true });

const CONCURRENCY = 3;

type Job = typeof jobs.$inferSelect & { description: string };

async function writeLetter(db: Db, job: Job): Promise<string> {
  const ctx = letterContext(db, job.id);
  if (!ctx?.cv) throw new Error("no CV for the letter");
  const letter = await writeCoverLetter({
    language: ctx.language,
    cv: ctx.cv,
    profile: ctx.profile,
    notes: ctx.notes,
    jobTitle: job.title,
    company: job.company,
    description: job.description,
  });
  saveLetter(db, job.id, letter);
  return `letter (${ctx.language})`;
}

async function main() {
  const minScore = Number(process.argv[2] ?? 80);
  const db = createDb(process.env.DATABASE_PATH ?? "data/jobbing.db");
  const todo = db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "ready"), gte(jobs.matchScore, minScore)))
    .all()
    .filter((j): j is Job => Boolean(j.description))
    .filter((j) => !getLetter(db, j.id))
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  console.log(`${todo.length} letters to draft (score >= ${minScore})`);

  let failed = 0;
  const queue = [...todo];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const label = `#${job.id} ${job.company} – ${job.title}`;
      try {
        const done = await writeLetter(db, job);
        const thin = thinPostingWarning(job.description);
        console.log(`✓ ${label}: ${done}${thin ? ` [${thin}]` : ""}`);
      } catch (err) {
        failed++;
        console.log(`✗ ${label}: ${(err as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Done: ${todo.length - failed} drafted, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
