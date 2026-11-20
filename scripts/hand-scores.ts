/**
 * Ranking jobs by hand.
 *
 *   npm run scores -- list [out.json]   unscored jobs with their descriptions (stdout or a file)
 *   npm run scores -- save scores.json  writes the scores; jobs still "new" below the profile's
 *                                       minimum score are set to "skipped"
 *
 * scores.json: [{ "id": 12, "score": 78, "verdict": "apply", "summary": "...", "reasons": [...], "concerns": [...] }]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { createDb } from "../src/db";
import { jobs } from "../src/db/schema";
import { getSearchProfile } from "../src/lib/search/profile";

config({ path: [".env.local", ".env"], quiet: true });

const scoresSchema = z.array(
  z.object({
    id: z.number().int(),
    score: z.number().int().min(0).max(100),
    verdict: z.enum(["apply", "maybe", "skip"]),
    summary: z.string().min(1),
    reasons: z.array(z.string()),
    concerns: z.array(z.string()),
  }),
);

function main() {
  const [cmd, file] = process.argv.slice(2);
  const db = createDb(process.env.DATABASE_PATH ?? "data/jobbing.db");

  if (cmd === "list") {
    const rows = db
      .select({
        id: jobs.id,
        company: jobs.company,
        title: jobs.title,
        location: jobs.location,
        postedAt: jobs.postedAt,
        url: jobs.url,
        description: jobs.description,
      })
      .from(jobs)
      .where(isNull(jobs.matchScore))
      .all();
    const json = JSON.stringify({ profile: getSearchProfile(db).about, jobs: rows }, null, 2);
    if (file) {
      writeFileSync(file, json);
      console.log(`${rows.length} unscored job(s) written to ${file}`);
    } else console.log(json);
    return;
  }

  if (cmd === "save" && file) {
    const scores = scoresSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    const { minScore } = getSearchProfile(db);
    let skipped = 0;
    db.transaction((tx) => {
      for (const { id, score, ...analysis } of scores) {
        tx.update(jobs)
          .set({ matchScore: score, analysis, updatedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(jobs.id, id))
          .run();
        if (score < minScore) {
          const r = tx.update(jobs).set({ status: "skipped" }).where(and(eq(jobs.id, id), eq(jobs.status, "new"))).run();
          skipped += r.changes;
        }
      }
    });
    console.log(`Saved ${scores.length} score(s); ${skipped} below ${minScore} set to skipped`);
    return;
  }

  console.error("Usage: npm run scores -- list [out.json] | save <scores.json>");
  process.exit(1);
}

main();
