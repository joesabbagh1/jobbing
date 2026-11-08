/**
 * Scores jobs that have a description but no AI score yet (the search also does this at the start of each run).
 *
 *   npm run score
 */
import { config } from "dotenv";
import { createDb } from "../src/db";
import { getSearchProfile } from "../src/lib/search/profile";
import { scoreUnscoredJobs } from "../src/lib/search/run";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const db = createDb(process.env.DATABASE_PATH ?? "data/jobbing.db");
  const { scored, errors } = await scoreUnscoredJobs(db, getSearchProfile(db), 500);
  console.log(`Scored ${scored} jobs`);
  for (const e of errors) console.log(`  ${e}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
