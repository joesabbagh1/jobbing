import { and, type AnyColumn, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import { applications, JOB_ORIGINS, JOB_STATUSES, type Job, type JobOrigin, type JobStatus, jobs } from "@/db/schema";

// Jobs list state lives in the URL (?q=&status=&match=&origin=&jd=&due=&group=&sort=&dir=) so views are shareable.

export const MATCH_FILTERS = { "80": "80+", "60": "60+", low: "Under 60", none: "Unscored" } as const;
export const GROUPS = { status: "Status", company: "Company", match: "Match", origin: "Source", location: "Location" } as const;
/** Sortable columns and the direction a first click sorts them in. */
export const SORT_COLUMNS = {
  match: "desc",
  title: "asc",
  company: "asc",
  location: "asc",
  status: "asc",
  added: "desc",
} as const;
export type SortColumn = keyof typeof SORT_COLUMNS;
export type SortDir = "asc" | "desc";
// Links from before column sorting.
const LEGACY_SORTS: Record<string, SortColumn> = { newest: "added", score: "match" };
export const ORIGIN_LABELS: Record<JobOrigin, string> = { airtable: "Grok bot", search: "Our search", api: "API" };

export type ListParams = {
  q: string;
  status?: JobStatus;
  match?: keyof typeof MATCH_FILTERS;
  origin?: JobOrigin;
  jd?: "yes" | "no";
  due: boolean;
  group?: keyof typeof GROUPS;
  sort: SortColumn;
  dir: SortDir;
};

const oneOf = <T extends string>(value: unknown, options: readonly T[]): T | undefined =>
  options.includes(value as T) ? (value as T) : undefined;

export function parseListParams(raw: Record<string, string | string[] | undefined>): ListParams {
  const get = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]);
  return {
    q: (get("q") ?? "").trim().slice(0, 200),
    status: oneOf(get("status"), JOB_STATUSES),
    match: oneOf(get("match"), Object.keys(MATCH_FILTERS) as (keyof typeof MATCH_FILTERS)[]),
    origin: oneOf(get("origin"), JOB_ORIGINS),
    jd: oneOf(get("jd"), ["yes", "no"] as const),
    due: get("due") === "1",
    group: oneOf(get("group"), Object.keys(GROUPS) as (keyof typeof GROUPS)[]),
    ...parseSort(get("sort"), get("dir")),
  };
}

function parseSort(rawSort: string | undefined, rawDir: string | undefined): { sort: SortColumn; dir: SortDir } {
  const sort =
    oneOf(rawSort, Object.keys(SORT_COLUMNS) as SortColumn[]) ?? (rawSort ? LEGACY_SORTS[rawSort] : undefined) ?? "added";
  return { sort, dir: oneOf(rawDir, ["asc", "desc"] as const) ?? SORT_COLUMNS[sort] };
}

/** Where clicking a column header goes: that column in its natural direction, or flipped if already active. */
export function sortUrl(params: ListParams, column: SortColumn): string {
  const dir = params.sort === column ? (params.dir === "asc" ? "desc" : "asc") : SORT_COLUMNS[column];
  return listUrl({ ...params, sort: column, dir });
}

/** URL for the list with some params changed; empty/default values are dropped. */
export function listUrl(params: ListParams, change: Partial<Record<keyof ListParams, string | boolean | undefined>> = {}) {
  const merged: Record<string, unknown> = { ...params, ...change };
  const p = new URLSearchParams();
  const sort = (merged.sort as SortColumn | undefined) ?? "added";
  for (const key of ["q", "status", "match", "origin", "jd", "due", "group", "sort", "dir"]) {
    const v = merged[key];
    if (key === "due") {
      if (v) p.set("due", "1");
    } else if (key === "sort") {
      if (sort !== "added") p.set("sort", sort);
    } else if (key === "dir") {
      if (v && v !== SORT_COLUMNS[sort]) p.set("dir", String(v)); // only when not the column's default
    } else if (typeof v === "string" && v) p.set(key, v);
  }
  return p.size ? `/?${p}` : "/";
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** WHERE conditions for everything except status (so status chips can show counts within the other filters). */
export function filterConditions(params: ListParams, today: string): SQL[] {
  const conditions: SQL[] = [];

  // Every word must appear in at least one of the text fields.
  for (const word of params.q.split(/\s+/).filter(Boolean)) {
    const pattern = `%${escapeLike(word)}%`;
    const fields = [jobs.title, jobs.company, jobs.location, jobs.notes, jobs.description];
    conditions.push(or(...fields.map((f) => sql`${f} LIKE ${pattern} ESCAPE '\\'`))!);
  }

  if (params.match === "80") conditions.push(gte(jobs.matchScore, 80));
  if (params.match === "60") conditions.push(gte(jobs.matchScore, 60));
  if (params.match === "low") conditions.push(lt(jobs.matchScore, 60));
  if (params.match === "none") conditions.push(isNull(jobs.matchScore));
  if (params.origin) conditions.push(eq(jobs.origin, params.origin));
  if (params.jd === "yes") conditions.push(isNotNull(jobs.description));
  if (params.jd === "no") conditions.push(isNull(jobs.description));
  if (params.due) {
    conditions.push(eq(jobs.status, "applied"));
    conditions.push(
      inArray(
        jobs.id,
        sql`(select ${applications.jobId} from ${applications} where ${applications.followUpOn} <= ${today})`,
      ),
    );
  }
  return conditions;
}

export function whereFor(params: ListParams, today: string): SQL | undefined {
  const conditions = filterConditions(params, today);
  if (params.status) conditions.push(eq(jobs.status, params.status));
  return conditions.length ? and(...conditions) : undefined;
}

export function orderFor(sort: SortColumn, dir: SortDir = SORT_COLUMNS[sort]) {
  const by = (expr: SQL) => (dir === "asc" ? asc(expr) : desc(expr));
  const text = (col: AnyColumn) => sql`lower(${col})`;
  // Ties fall back to newest first so the order is stable.
  const tiebreak = [desc(jobs.createdAt), desc(jobs.id)];
  switch (sort) {
    case "match":
      return [sql`${jobs.matchScore} IS NULL`, by(sql`${jobs.matchScore}`), ...tiebreak];
    case "title":
      return [by(text(jobs.title)), ...tiebreak];
    case "company":
      return [sql`${jobs.company} = ''`, by(text(jobs.company)), asc(text(jobs.title)), ...tiebreak];
    case "location":
      return [sql`coalesce(${jobs.location}, '') = ''`, by(text(jobs.location)), ...tiebreak];
    case "status": {
      // Workflow order (new → … → skipped), not alphabetical.
      const rank = sql.join(
        JOB_STATUSES.map((st, i) => sql`when ${st} then ${i}`),
        sql` `,
      );
      return [by(sql`case ${jobs.status} ${rank} end`), ...tiebreak];
    }
    default:
      return dir === "asc" ? [asc(jobs.createdAt), asc(jobs.id)] : tiebreak;
  }
}

export type JobGroup = { key: string; label: string; jobs: Job[] };

function matchBand(score: number | null): { key: string; label: string } {
  if (score == null) return { key: "4", label: "Unscored" };
  if (score >= 80) return { key: "1", label: "80+ (apply)" };
  if (score >= 60) return { key: "2", label: "60–79 (worth a look)" };
  return { key: "3", label: "Under 60" };
}

/** "Saint-Mandé, IDF, France" → "Saint-Mandé"; "Hybrid Paris; Hybrid London" → "Paris". */
export function primaryCity(location: string | null): string {
  if (!location?.trim()) return "Unknown";
  const first = location.split(/[;,]/)[0].replace(/^(hybrid|remote|on-?site)\s+/i, "").trim();
  return first || "Unknown";
}

/** Splits an already-sorted list into labelled groups, keeping the sort order within each group. */
export function groupJobs(rows: Job[], by: ListParams["group"]): JobGroup[] {
  if (!by) return [{ key: "all", label: "", jobs: rows }];
  const groups = new Map<string, JobGroup>();
  for (const job of rows) {
    const { key, label } =
      by === "status"
        ? { key: String(JOB_STATUSES.indexOf(job.status)).padStart(2, "0"), label: job.status }
        : by === "match"
          ? matchBand(job.matchScore)
          : by === "origin"
            ? { key: job.origin ?? "zz", label: job.origin ? ORIGIN_LABELS[job.origin] : "Unknown" }
            : by === "company"
              ? { key: (job.company || "~").toLowerCase(), label: job.company || "Unknown company" }
              : { key: primaryCity(job.location).toLowerCase(), label: primaryCity(job.location) };
    if (!groups.has(key)) groups.set(key, { key, label, jobs: [] });
    groups.get(key)!.jobs.push(job);
  }
  const list = [...groups.values()];
  // Status and match bands have a natural order; companies and cities: biggest groups first.
  if (by === "status" || by === "match" || by === "origin") return list.sort((a, b) => a.key.localeCompare(b.key));
  return list.sort((a, b) => b.jobs.length - a.jobs.length || a.label.localeCompare(b.label));
}

