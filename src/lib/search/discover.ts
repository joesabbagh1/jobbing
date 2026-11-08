import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { ATS_TYPES, type AtsType, boardLookups } from "@/db/schema";
import { listPostings, type Posting } from "./sources";

// Finds the career board of a company seen on LinkedIn. LinkedIn hides the "apply on company site" link from
// logged-out visitors, so we guess the board name from the company name on each supported ATS, and only accept
// a board that lists the same job. A slug can belong to an unrelated company; the matching job rules that out.

const RECHECK_DAYS = 30;
// Job aggregators that post on LinkedIn under their own name: their "board" is thousands of other companies' jobs.
const AGGREGATORS = new Set(["jobgether", "crossover", "turing", "jooble", "talentcom", "jobleads", "remotive"]);

const LEGAL_SUFFIXES = new Set([
  "sas", "sasu", "sa", "sarl", "inc", "ltd", "llc", "gmbh", "bv", "plc", "group", "groupe", "france", "hq",
]);
const TITLE_NOISE = new Set([
  "h", "f", "m", "w", "d", "x", "hf", "fh", "mf", "fm", "hfx", "mfx", "mwd", "wmd", "nb", "cdi", "de", "du", "des",
  "la", "le", "les", "en", "et", "the", "a", "an", "of", "and", "for", "in", "at", "to",
]);

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Words of a company name without legal-form noise: "Back Market SAS" → ["back", "market"]. */
function nameWords(name: string): string[] {
  const words = normalize(name)
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const kept = words.filter((w) => !LEGAL_SUFFIXES.has(w));
  return kept.length ? kept : words;
}

/** Comparable form of a company name, so "Qonto", "QONTO SAS" and "Qonto (YC)" are the same company. */
export function companyKey(name: string): string {
  return nameWords(name).join("");
}

/** Meaningful words of a job title, without gender markers like "(H/F)" or "M/W/D". */
export function titleWords(title: string): string[] {
  return normalize(title)
    .replace(/\b[hfmwdx](\s*\/\s*[hfmwdx])+\b/g, " ")
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w && !TITLE_NOISE.has(w));
}

/** Comparable form of a job title, for spotting the same job posted in two places. */
export function titleKey(title: string): string {
  return [...new Set(titleWords(title))].sort().join(" ");
}

/** Same job? "DevOps Engineer (H/F)" ≈ "DevOps Engineer - Paris", but not "Senior DevOps Engineer" vs "Data Engineer". */
export function titlesMatch(a: string, b: string): boolean {
  const A = new Set(titleWords(a));
  const B = new Set(titleWords(b));
  if (!A.size || !B.size) return false;
  const shared = [...A].filter((w) => B.has(w)).length;
  const subset = shared === Math.min(A.size, B.size) && shared >= 2;
  return subset || shared / new Set([...A, ...B]).size >= 0.6;
}

/** Board names a company probably uses: "Back Market" → ["backmarket", "back-market"]. */
export function slugCandidates(name: string): string[] {
  const words = nameWords(name);
  if (!words.length) return [];
  return [...new Set([words.join(""), words.join("-")])];
}

export type BoardMatch = { ats: AtsType; slug: string; postings: Posting[] };

/** Probes every supported ATS for the company's board and returns it if it lists one of `titles`. */
export async function findBoard(name: string, titles: string[]): Promise<BoardMatch | null> {
  for (const slug of slugCandidates(name)) {
    const found = await Promise.all(
      ATS_TYPES.map(async (ats) => {
        const postings = await listPostings({ ats, slug, name }).catch(() => [] as Posting[]);
        return postings.some((p) => titles.some((t) => titlesMatch(t, p.title))) ? { ats, slug, postings } : null;
      }),
    );
    const match = found.find(Boolean);
    if (match) return match;
  }
  return null;
}

/**
 * findBoard, remembered per company: a company is probed once, and again only after a month if nothing was
 * found. A board found earlier (and possibly removed by the user since) is never re-added.
 */
export async function lookupBoard(db: Db, name: string, titles: string[]): Promise<BoardMatch | null> {
  const key = companyKey(name);
  if (!key || AGGREGATORS.has(key)) return null;
  const previous = db.select().from(boardLookups).where(eq(boardLookups.key, key)).get();
  if (previous) {
    const ageDays = (Date.now() - Date.parse(`${previous.checkedAt.replace(" ", "T")}Z`)) / 86_400_000;
    if (previous.ats || ageDays < RECHECK_DAYS) return null;
  }
  const match = await findBoard(name, titles);
  const row = { name, ats: match?.ats ?? null, slug: match?.slug ?? null, checkedAt: sql`CURRENT_TIMESTAMP` };
  db.insert(boardLookups)
    .values({ key, ...row })
    .onConflictDoUpdate({ target: boardLookups.key, set: row })
    .run();
  return match;
}
