import { sql } from "drizzle-orm";
import { blob, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { APPLY_CHANNELS } from "../lib/apply/channels";

export const JOB_ORIGINS = ["airtable", "search", "api"] as const;
export type JobOrigin = (typeof JOB_ORIGINS)[number];

/** DeepSeek's assessment of how well a job fits the search profile. */
export type JobAnalysis = {
  verdict: "apply" | "maybe" | "skip";
  summary: string;
  reasons: string[];
  concerns: string[];
};

import { JOB_STATUSES, type JobStatus } from "../lib/jobs/statuses";

export { JOB_STATUSES, type JobStatus };

export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  airtableId: text("airtable_id").unique(),
  company: text("company").notNull().default(""),
  title: text("title").notNull(),
  location: text("location"),
  source: text("source"),
  description: text("description"),
  // Where the description came from (lever, ashby, jsonld, page, manual, ...),
  // and the outcome of the last automatic fetch attempt.
  descriptionSource: text("description_source"),
  descriptionError: text("description_error"),
  descriptionFetchedAt: text("description_fetched_at"),
  postedAt: text("posted_at"),
  extra: text("extra", { mode: "json" }).$type<Record<string, unknown>>(),
  status: text("status", { enum: JOB_STATUSES }).notNull().default("new"),
  // How the job reached the platform.
  origin: text("origin", { enum: JOB_ORIGINS }),
  // 0–100 fit score and reasoning from DeepSeek.
  matchScore: real("match_score"),
  analysis: text("analysis", { mode: "json" }).$type<JobAnalysis>(),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type Job = typeof jobs.$inferSelect;

export const ATS_TYPES = ["lever", "ashby", "greenhouse", "smartrecruiters", "workable"] as const;
export type AtsType = (typeof ATS_TYPES)[number];

/** Company career boards the search pulls from. */
export const companies = sqliteTable(
  "companies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    ats: text("ats", { enum: ATS_TYPES }).notNull(),
    slug: text("slug").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    lastCheckedAt: text("last_checked_at"),
    lastJobCount: integer("last_job_count"),
    lastError: text("last_error"),
    /** "linkedin" when the search found the board itself from a LinkedIn posting. */
    discoveredFrom: text("discovered_from"),
  },
  (t) => [uniqueIndex("companies_ats_slug").on(t.ats, t.slug)],
);

export type Company = typeof companies.$inferSelect;

/** Companies seen on LinkedIn that were checked for a readable career board, so each is probed once a month at most. */
export const boardLookups = sqliteTable("board_lookups", {
  /** Normalised company name (see companyKey). */
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  /** Set when a board was found. */
  ats: text("ats", { enum: ATS_TYPES }),
  slug: text("slug"),
  checkedAt: text("checked_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

/** Postings the AI scored below the threshold, so they aren't scored again every run. */
export const rejectedPostings = sqliteTable("rejected_postings", {
  url: text("url").primaryKey(),
  company: text("company").notNull(),
  title: text("title").notNull(),
  location: text("location"),
  matchScore: real("match_score"),
  summary: text("summary"),
  rejectedAt: text("rejected_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

/** A copy of the master CV customised for one job. */
export const tailoredCvs = sqliteTable("tailored_cvs", {
  jobId: integer("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

/** One cover letter per job. */
export const coverLetters = sqliteTable("cover_letters", {
  jobId: integer("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

/** What was actually sent for a job: frozen CV/letter content and the exact PDFs. */
export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id")
    .notNull()
    .unique()
    .references(() => jobs.id, { onDelete: "cascade" }),
  appliedAt: text("applied_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  via: text("via", { enum: APPLY_CHANNELS }).notNull().default("company site"),
  notes: text("notes"),
  /** YYYY-MM-DD; the jobs list flags it once this date has passed. */
  followUpOn: text("follow_up_on"),
  cv: text("cv", { mode: "json" }).notNull(),
  letter: text("letter", { mode: "json" }),
  cvPdf: blob("cv_pdf", { mode: "buffer" }).notNull(),
  cvFilename: text("cv_filename").notNull(),
  letterPdf: blob("letter_pdf", { mode: "buffer" }),
  letterFilename: text("letter_filename"),
});

export type Application = typeof applications.$inferSelect;

/** Small key/value store for settings (search profile, master CV, last run times). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export const PLACE_KINDS = ["place", "broad"] as const;

/**
 * Coordinates for each distinct job location text, filled by the AI once per text and reused after that.
 * "broad" means no single point fits (remote, a whole country, several countries): no pin.
 */
export const places = sqliteTable("places", {
  /** Normalized location text (see placeKey). */
  query: text("query").primaryKey(),
  kind: text("kind", { enum: PLACE_KINDS }).notNull(),
  /** Short name shown on the map, e.g. "Paris" or "Remote (France)". */
  label: text("label").notNull(),
  lat: real("lat"),
  lng: real("lng"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type Place = typeof places.$inferSelect;
