/**
 * Fetches missing job descriptions from the command line.
 * The app also does this automatically after each Airtable sync.
 *
 *   npm run fetch:descriptions            # jobs never attempted
 *   npm run fetch:descriptions -- --retry # also retry jobs whose last attempt failed
 */
import { config } from "dotenv";
import { isNull } from "drizzle-orm";
import { createDb } from "../src/db";
import { jobs } from "../src/db/schema";
import { enrichPending } from "../src/lib/jobs/description/enrich";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const db = createDb(process.env.DATABASE_PATH ?? "data/jobbing.db");
  if (process.argv.includes("--retry")) {
    db.update(jobs)
      .set({ descriptionFetchedAt: null })
      .where(isNull(jobs.description))
      .run();
  }

  const results = await enrichPending(db);
  const bySource = new Map<string, number>();
  for (const r of results) if (r.ok) bySource.set(r.source!, (bySource.get(r.source!) ?? 0) + 1);
  const failed = results.filter((r) => !r.ok);

  console.log(`Fetched ${results.length - failed.length}/${results.length}`, Object.fromEntries(bySource));
  for (const f of failed) console.log(`  #${f.id}: ${f.error}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
