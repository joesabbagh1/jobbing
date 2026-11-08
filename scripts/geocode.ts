/**
 * Looks up coordinates for job locations not on the map yet (the app also does this after each sync and search).
 *
 *   npm run geocode
 */
import { config } from "dotenv";
import { createDb } from "../src/db";
import { geocodePending } from "../src/lib/geo/geocode";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { looked, saved, errors } = await geocodePending(createDb(process.env.DATABASE_PATH ?? "data/jobbing.db"));
  console.log(`Placed ${saved} of ${looked} new locations`);
  for (const e of errors) console.log(`  ${e}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
