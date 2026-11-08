/**
 * Runs the job search from the command line.
 * The app also runs it automatically every few hours.
 *
 *   npm run search            # full run: list, filter, score, add
 *   npm run search -- --dry   # list and filter only; prints what would be scored, writes nothing
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createDb } from "../src/db";
import { companies, jobs } from "../src/db/schema";
import { normalizeJobUrl } from "../src/lib/jobs/normalize-url";
import { seedCompanies } from "../src/lib/search/companies";
import { prefilter } from "../src/lib/search/filter";
import { getSearchProfile } from "../src/lib/search/profile";
import { runSearch } from "../src/lib/search/run";
import { listPostings } from "../src/lib/search/sources";

config({ path: [".env.local", ".env"], quiet: true });

async function dryRun() {
  const db = createDb(process.env.DATABASE_PATH ?? "data/jobbing.db");
  seedCompanies(db);
  const profile = getSearchProfile(db);
  const known = new Set(db.select({ url: jobs.url }).from(jobs).all().map((r) => r.url));
  const boards = db.select().from(companies).where(eq(companies.enabled, true)).all();

  const reasons: Record<string, number> = {};
  let total = 0;
  const pass: string[] = [];
  for (const c of boards) {
    try {
      const list = await listPostings(c);
      total += list.length;
      for (const p of list) {
        const r = prefilter(p, profile);
        if (!r.pass) {
          reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
          continue;
        }
        const tag = known.has(normalizeJobUrl(p.url)) ? " (already in platform)" : "";
        pass.push(`${c.name.padEnd(14)} ${p.title} — ${p.location ?? "?"}${tag}`);
      }
    } catch (err) {
      console.log(`! ${c.name}: ${(err as Error).message}`);
    }
  }
  console.log(`${boards.length} boards, ${total} postings. Dropped:`, reasons);
  console.log(`${pass.length} pass the filters:\n  ${pass.join("\n  ")}`);
}

async function main() {
  if (process.argv.includes("--dry")) return dryRun();
  const r = await runSearch(createDb(process.env.DATABASE_PATH ?? "data/jobbing.db"));
  console.log(JSON.stringify(r, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
