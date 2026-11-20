/**
 * Saves job postings that Claude found on the web (scripts/job-hunt.md) straight to the database.
 *
 *   npm run hunt -- add found.json
 *
 * found.json: [{ "url", "title", "company", "location"?, "postedAt"?, "description"? }]
 *
 * Each posting goes through the search profile's filters (title keywords, excluded titles and companies, age), is
 * skipped if the jobs list or the rejected list already has it (same URL, or same company and title), and is then
 * added with origin "claude". Its description is fetched from the page; the one Claude gives (the full posting, or an
 * Indeed alert snippet) is only kept when the page can't be fetched. New jobs stay unscored until the daily ranking.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createDb } from "../src/db";
import { jobs, rejectedPostings } from "../src/db/schema";
import { enrichJob } from "../src/lib/jobs/description/enrich";
import { normalizeJobUrl } from "../src/lib/jobs/normalize-url";
import { upsertJob } from "../src/lib/jobs/upsert";
import { companyKey, titleKey } from "../src/lib/search/discover";
import { prefilter } from "../src/lib/search/filter";
import { getSearchProfile } from "../src/lib/search/profile";

config({ path: [".env.local", ".env"], quiet: true });

const foundSchema = z.array(
  z.object({
    url: z.url({ protocol: /^https?$/ }),
    title: z.string().trim().min(1),
    company: z.string().trim().min(1),
    location: z.string().trim().optional(),
    postedAt: z.string().trim().optional(),
    description: z.string().trim().optional(),
  }),
);

/** "fr.hellowork.com" → "hellowork", "www.welcometothejungle.com" → "welcometothejungle". */
function siteName(url: string): string {
  const parts = new URL(url).hostname.replace(/^www\./, "").split(".");
  return parts.length > 2 ? parts[parts.length - 2] : parts[0];
}

async function main() {
  const [cmd, file] = process.argv.slice(2);
  if (cmd !== "add" || !file) {
    console.error("Usage: npm run hunt -- add <found.json>");
    process.exit(1);
  }
  const db = createDb(process.env.DATABASE_PATH ?? "data/jobbing.db");
  const profile = getSearchProfile(db);
  const found = foundSchema.parse(JSON.parse(readFileSync(file, "utf8")));

  const pairKey = (company: string, title: string) => `${companyKey(company)}|${titleKey(title)}`;
  const known = [
    ...db.select({ url: jobs.url, company: jobs.company, title: jobs.title }).from(jobs).all(),
    ...db.select({ url: rejectedPostings.url, company: rejectedPostings.company, title: rejectedPostings.title }).from(rejectedPostings).all(),
  ];
  const knownUrls = new Set(known.map((r) => r.url));
  const knownPairs = new Set(known.map((r) => pairKey(r.company, r.title)));

  const added: string[] = [];
  const duplicates: string[] = [];
  const filtered: string[] = [];
  const noDescription: string[] = [];

  for (const f of found) {
    const name = `${f.company} – ${f.title}`;
    const check = prefilter({ url: f.url, title: f.title, company: f.company, location: f.location, postedAt: f.postedAt }, profile);
    if (!check.pass) {
      filtered.push(`${name} (${check.reason})`);
      continue;
    }
    const url = normalizeJobUrl(f.url);
    const pair = pairKey(f.company, f.title);
    if (knownUrls.has(url) || knownPairs.has(pair)) {
      duplicates.push(name);
      continue;
    }
    knownUrls.add(url);
    knownPairs.add(pair);

    const { id } = upsertJob(
      db,
      { url, title: f.title, company: f.company, location: f.location, postedAt: f.postedAt, source: siteName(url) },
      "claude",
    );
    const fetched = await enrichJob(db, id);
    if (!fetched.ok) {
      if (f.description && f.description.length >= 80) {
        db.update(jobs)
          .set({ description: f.description, descriptionSource: "claude", descriptionError: null })
          .where(eq(jobs.id, id))
          .run();
      } else {
        noDescription.push(`#${id} ${name}: ${fetched.error}`);
      }
    }
    added.push(`#${id} ${name}${f.location ? ` (${f.location})` : ""}`);
  }

  const list = (title: string, items: string[]) => {
    console.log(`${title}: ${items.length}`);
    for (const i of items) console.log(`  ${i}`);
  };
  list("Added", added);
  list("Already known", duplicates);
  list("Filtered out", filtered);
  list("Added without a description", noDescription);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
