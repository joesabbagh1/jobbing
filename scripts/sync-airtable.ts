/**
 * Pulls the Airtable findings into the local database from the command line.
 * The app also does this automatically while it runs; this is for checking the mapping.
 *
 *   npm run sync:airtable            # import
 *   npm run sync:airtable -- --dry   # print the field mapping and first rows only
 */
import { config } from "dotenv";
import { createDb } from "../src/db";
import { fetchAirtableJobs, syncAirtable } from "../src/lib/airtable/sync";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  if (process.argv.includes("--dry")) {
    const { fetched, columns, mapping, inputs, skipped } = await fetchAirtableJobs();
    console.log(`Fetched ${fetched} records (${skipped} without URL/title).`);
    console.log("Columns found:", columns.join(", "));
    console.log("Mapping:", mapping);
    console.log("First 3 mapped rows:", JSON.stringify(inputs.slice(0, 3), null, 2));
    return;
  }

  const r = await syncAirtable(createDb(process.env.DATABASE_PATH ?? "data/jobbing.db"));
  if (r.error) throw new Error(r.error);
  console.log(
    `Fetched ${r.fetched}: created ${r.created}, already present ${r.existing}, skipped ${r.skipped} without URL/title.`,
  );
  if (r.failed.length) console.log(`Failed ${r.failed.length}:\n  ${r.failed.join("\n  ")}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
