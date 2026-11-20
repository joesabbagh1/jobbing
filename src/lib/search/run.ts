import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { companies, jobs, rejectedPostings } from "@/db/schema";
import { normalizeJobUrl } from "@/lib/jobs/normalize-url";
import { upsertJob } from "@/lib/jobs/upsert";
import { getSetting, setSetting } from "@/lib/settings";
import { seedCompanies } from "./companies";
import { companyKey, lookupBoard, titleKey, titlesMatch } from "./discover";
import { prefilter } from "./filter";
import { searchFranceTravail } from "./francetravail";
import { searchLinkedIn } from "./linkedin";
import { searchJeanMichel } from "./jeanmichel";
import { getSearchProfile, type SearchProfile } from "./profile";
import { listPostings, type Posting, postingDescription } from "./sources";

export type SearchResult = {
  startedAt: string;
  finishedAt?: string;
  companies: number;
  postings: number;
  /** Postings found on LinkedIn (before filters). */
  linkedin?: number;
  /** Permanent roles found on Jean-Michel.io (before filters). */
  jeanMichel?: number;
  /** Permanent roles found through France Travail's API (before filters); absent when it isn't set up. */
  franceTravail?: number;
  /** Company boards found from LinkedIn postings and added to the list this run. */
  discovered?: string[];
  matchedFilters: number;
  alreadyKnown: number;
  /** New matches added to the jobs list, unscored until they're ranked by hand. */
  added: number;
  /** Every board failed (usually no network): the scheduler retries soon instead of in hours. */
  allBoardsFailed?: boolean;
  errors: string[];
};

// Caps board probing per run (each company costs up to ~10 small requests); the rest wait for the next run.
const MAX_BOARD_LOOKUPS = 40;
const LAST_RESULT_KEY = "lastSearch";

export function getLastSearch(db: Db): SearchResult | undefined {
  return getSetting<SearchResult>(db, LAST_RESULT_KEY);
}

const g = globalThis as unknown as { __searchRun?: Promise<SearchResult> };

export function isSearchRunning(): boolean {
  return Boolean(g.__searchRun);
}

/** Pulls every enabled company board, filters by keywords and adds new matches unscored. Never throws. */
export function runSearch(db: Db): Promise<SearchResult> {
  g.__searchRun ??= doSearch(db).finally(() => {
    g.__searchRun = undefined;
  });
  return g.__searchRun;
}

async function doSearch(db: Db): Promise<SearchResult> {
  seedCompanies(db);
  const profile = getSearchProfile(db);
  const result: SearchResult = {
    startedAt: new Date().toISOString(),
    companies: 0,
    postings: 0,
    linkedin: 0,
    jeanMichel: 0,
    discovered: [],
    matchedFilters: 0,
    alreadyKnown: 0,
    added: 0,
    errors: [],
  };

  // 1. List every enabled board, a few at a time.
  const boards = db.select().from(companies).where(eq(companies.enabled, true)).all();
  result.companies = boards.length;
  const postings: Posting[] = [];
  await forEachLimit(boards, 4, async (c) => {
    try {
      const list = await listPostings(c);
      postings.push(...list);
      db.update(companies)
        .set({ lastCheckedAt: sql`CURRENT_TIMESTAMP`, lastJobCount: list.length, lastError: null })
        .where(eq(companies.id, c.id))
        .run();
    } catch (err) {
      const message = (err as Error).message;
      result.errors.push(`${c.name}: ${message}`);
      db.update(companies)
        .set({ lastCheckedAt: sql`CURRENT_TIMESTAMP`, lastError: message })
        .where(eq(companies.id, c.id))
        .run();
    }
  });

  // 1b. LinkedIn, which also reveals new companies whose own boards we can then read.
  if (profile.linkedin.enabled && profile.linkedin.queries.length > 0) {
    postings.push(...(await searchLinkedInWithDiscovery(db, profile, result)));
  }

  // 1c. Jean-Michel.io, which mostly lists consultancies' permanent roles.
  if (profile.jeanMichel.enabled && profile.jeanMichel.queries.length > 0) {
    const { postings: found, error } = await searchJeanMichel(profile.jeanMichel);
    result.jeanMichel = found.length;
    if (error) result.errors.push(error);
    postings.push(...found);
  }

  // 1d. France Travail, the national job database (only when its API keys are in .env.local).
  {
    const { postings: found, error } = await searchFranceTravail(profile.maxAgeDays);
    if (found.length || error) result.franceTravail = found.length;
    if (error) result.errors.push(error);
    postings.push(...found);
  }
  result.postings = postings.length;

  // 2. Cheap filters, then drop anything already in the platform or already rejected.
  // Job-board postings are also matched on company + title: the same job is often reposted under new IDs or
  // listed on several sites. Company boards are listed first, so the company's own page wins.
  const pairKey = (company: string, title: string) => `${companyKey(company)}|${titleKey(title)}`;
  const jobRows = db.select({ url: jobs.url, company: jobs.company, title: jobs.title }).from(jobs).all();
  const rejectedRows = db
    .select({ url: rejectedPostings.url, company: rejectedPostings.company, title: rejectedPostings.title })
    .from(rejectedPostings)
    .all();
  const known = new Set([...jobRows, ...rejectedRows].map((r) => r.url));
  const knownPairs = new Set([...jobRows, ...rejectedRows].map((r) => pairKey(r.company, r.title)));
  const candidates = new Map<string, Posting>();
  for (const p of postings) {
    if (!prefilter(p, profile).pass) continue;
    result.matchedFilters++;
    let url: string;
    try {
      url = normalizeJobUrl(p.url);
    } catch {
      continue;
    }
    const pair = pairKey(p.company, p.title);
    if (known.has(url) || (p.source && knownPairs.has(pair))) {
      result.alreadyKnown++;
    } else if (!candidates.has(url)) {
      candidates.set(url, p);
      knownPairs.add(pair);
    }
  }

  // 3. Add the new matches with their descriptions, unscored.
  for (const [url, p] of candidates) {
    try {
      const description = await postingDescription(p);
      upsertJob(
        db,
        {
          url,
          title: p.title,
          company: p.company,
          location: p.location,
          postedAt: p.postedAt,
          source: p.source,
          description: description || undefined,
        },
        "search",
      );
      result.added++;
    } catch (err) {
      result.errors.push(`${p.company} – ${p.title}: ${(err as Error).message.split("\n")[0]}`);
    }
  }

  result.allBoardsFailed = boards.length > 0 && result.postings === 0 && result.errors.length >= boards.length;
  result.finishedAt = new Date().toISOString();
  setSetting(db, LAST_RESULT_KEY, result);
  return result;
}

/**
 * LinkedIn postings that pass the filters, minus companies whose board is already in the list. For other
 * companies it looks for their own board: when found, the board is added (and read now, so its other matching
 * jobs come in too) and the LinkedIn copies of its jobs are dropped in favour of the company's own pages.
 */
async function searchLinkedInWithDiscovery(db: Db, profile: SearchProfile, result: SearchResult): Promise<Posting[]> {
  const { postings, error } = await searchLinkedIn(profile.linkedin, profile.maxAgeDays);
  result.linkedin = postings.length;
  if (error) result.errors.push(error);

  // Every company in the list, active or paused: a paused board means "not interested", so skip it here too.
  const listed = new Set(db.select({ name: companies.name }).from(companies).all().map((c) => companyKey(c.name)));
  const byCompany = new Map<string, Posting[]>();
  for (const p of postings) {
    const key = companyKey(p.company);
    if (!key || listed.has(key) || !prefilter(p, profile).pass) continue;
    byCompany.set(key, [...(byCompany.get(key) ?? []), p]);
  }

  const out: Posting[] = [];
  await forEachLimit([...byCompany.values()].slice(0, MAX_BOARD_LOOKUPS), 3, async (group) => {
    const name = group[0].company;
    try {
      const board = await lookupBoard(db, name, group.map((p) => p.title));
      if (!board) {
        out.push(...group);
        return;
      }
      db.insert(companies)
        .values({
          name,
          ats: board.ats,
          slug: board.slug,
          discoveredFrom: "linkedin",
          lastCheckedAt: sql`CURRENT_TIMESTAMP`,
          lastJobCount: board.postings.length,
        })
        .onConflictDoNothing()
        .run();
      result.discovered!.push(name);
      out.push(...board.postings, ...group.filter((p) => !board.postings.some((b) => titlesMatch(p.title, b.title))));
    } catch (err) {
      result.errors.push(`Board lookup for ${name}: ${(err as Error).message}`);
      out.push(...group);
    }
  });
  // Companies beyond the lookup cap still contribute their LinkedIn postings.
  for (const group of [...byCompany.values()].slice(MAX_BOARD_LOOKUPS)) out.push(...group);
  return out;
}

async function forEachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
    }),
  );
}
