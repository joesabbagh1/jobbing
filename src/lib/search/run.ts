import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { companies, jobs, rejectedPostings } from "@/db/schema";
import { isAiConfigured } from "@/lib/ai/deepseek";
import { scoreJob } from "@/lib/ai/score-job";
import { normalizeJobUrl } from "@/lib/jobs/normalize-url";
import { upsertJob } from "@/lib/jobs/upsert";
import { getSetting, setSetting } from "@/lib/settings";
import { seedCompanies } from "./companies";
import { companyKey, lookupBoard, titleKey, titlesMatch } from "./discover";
import { prefilter } from "./filter";
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
  /** Company boards found from LinkedIn postings and added to the list this run. */
  discovered?: string[];
  matchedFilters: number;
  alreadyKnown: number;
  added: number;
  rejectedByAi: number;
  /** Existing jobs (e.g. from Airtable) scored this run. */
  rescored: number;
  /** Candidates left for the next run because the per-run AI budget ran out. */
  deferred: number;
  aiEnabled: boolean;
  /** Every board failed (usually no network): the scheduler retries soon instead of in hours. */
  allBoardsFailed?: boolean;
  errors: string[];
};

// Caps DeepSeek usage per run; leftovers are picked up next time.
const MAX_AI_CALLS = Number(process.env.SEARCH_MAX_AI_CALLS) || 80;
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

/** Pulls every enabled company board, filters, scores with DeepSeek and adds good matches. Never throws. */
export function runSearch(db: Db): Promise<SearchResult> {
  g.__searchRun ??= doSearch(db).finally(() => {
    g.__searchRun = undefined;
  });
  return g.__searchRun;
}

async function doSearch(db: Db): Promise<SearchResult> {
  seedCompanies(db);
  const profile = getSearchProfile(db);
  const aiEnabled = isAiConfigured();
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
    rejectedByAi: 0,
    rescored: 0,
    deferred: 0,
    aiEnabled,
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

  // 3. Score jobs already in the list that have a description but no score yet (from Airtable, the API, or a
  // description fetched later). They come first: they're already on the jobs page, waiting for a score.
  let aiCalls = 0;
  if (aiEnabled) {
    const { scored, errors } = await scoreUnscoredJobs(db, profile, MAX_AI_CALLS);
    aiCalls += scored + errors.length;
    result.rescored = scored;
    result.errors.push(...errors);
  }

  // 4. Score new candidates with DeepSeek (or add them unscored if no key is set).
  for (const [url, p] of candidates) {
    if (aiEnabled && aiCalls >= MAX_AI_CALLS) {
      result.deferred++;
      continue;
    }
    try {
      const description = await postingDescription(p);
      const input = {
        url,
        title: p.title,
        company: p.company,
        location: p.location,
        postedAt: p.postedAt,
        source: p.source,
        description: description || undefined,
      };

      if (!aiEnabled) {
        upsertJob(db, input, "search");
        result.added++;
        continue;
      }

      aiCalls++;
      const { score, analysis } = await scoreJob({ profile: profile.about, ...input, description });
      if (score >= profile.minScore) {
        const { id } = upsertJob(db, input, "search");
        db.update(jobs)
          .set({ matchScore: score, analysis, descriptionSource: "search" })
          .where(eq(jobs.id, id))
          .run();
        result.added++;
      } else {
        db.insert(rejectedPostings)
          .values({ url, company: p.company, title: p.title, location: p.location, matchScore: score, summary: analysis.summary })
          .onConflictDoNothing()
          .run();
        result.rejectedByAi++;
      }
    } catch (err) {
      result.errors.push(`${p.company} – ${p.title}: ${(err as Error).message.split("\n")[0]}`);
    }
  }

  result.allBoardsFailed = boards.length > 0 && result.postings === 0 && result.errors.length >= boards.length;
  result.finishedAt = new Date().toISOString();
  setSetting(db, LAST_RESULT_KEY, result);
  return result;
}

/** Airtable columns we don't map (notes, tags...) as text, for jobs whose description couldn't be fetched. */
function extraAsText(extra: unknown): string {
  if (!extra || typeof extra !== "object") return "";
  return Object.entries(extra)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join("\n");
}

/**
 * Scores jobs in the list that have no score, up to `budget` AI calls. Uses the description, or the Airtable
 * notes when fetching the description was tried and failed.
 */
export async function scoreUnscoredJobs(
  db: Db,
  profile: SearchProfile,
  budget: number,
): Promise<{ scored: number; errors: string[] }> {
  const unscored = db
    .select()
    .from(jobs)
    .where(
      and(
        isNull(jobs.matchScore),
        or(isNotNull(jobs.description), and(isNotNull(jobs.descriptionError), isNotNull(jobs.extra))),
      ),
    )
    .limit(budget)
    .all();
  let scored = 0;
  const errors: string[] = [];
  for (const job of unscored) {
    try {
      await scoreAndStore(db, profile, job);
      scored++;
    } catch (err) {
      errors.push(`Scoring #${job.id}: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  return { scored, errors };
}

/** Scores one job now, e.g. after its description was pasted. Throws on AI errors. */
export async function rescoreJob(db: Db, id: number): Promise<void> {
  const job = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (job) await scoreAndStore(db, getSearchProfile(db), job);
}

async function scoreAndStore(db: Db, profile: SearchProfile, job: typeof jobs.$inferSelect) {
  const { score, analysis } = await scoreJob({
    profile: profile.about,
    title: job.title,
    company: job.company,
    location: job.location ?? undefined,
    description: job.description ?? `(Full posting unavailable; notes from Airtable)\n${extraAsText(job.extra)}`,
  });
  db.update(jobs).set({ matchScore: score, analysis }).where(eq(jobs.id, job.id)).run();
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
