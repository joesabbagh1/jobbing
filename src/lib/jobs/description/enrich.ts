import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { jobs } from "@/db/schema";
import { DescriptionError, fetchDescription } from "./fetch";

export type EnrichResult = { id: number; ok: boolean; source?: string; error?: string };

/** Fetches and stores the description for one job. Never overwrites an existing description. */
export async function enrichJob(db: Db, id: number): Promise<EnrichResult> {
  const job = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!job) return { id, ok: false, error: "Job not found" };
  if (job.description) return { id, ok: true, source: job.descriptionSource ?? undefined };

  try {
    const { text, location, source } = await fetchDescription(job.url);
    db.update(jobs)
      .set({
        description: text,
        descriptionSource: source,
        descriptionError: null,
        descriptionFetchedAt: sql`CURRENT_TIMESTAMP`,
        ...(!job.location && location ? { location } : {}),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(and(eq(jobs.id, id), isNull(jobs.description)))
      .run();
    return { id, ok: true, source };
  } catch (err) {
    const message =
      err instanceof DescriptionError
        ? err.message
        : `Fetch failed (${(err as Error).message}). Try again later or paste it below.`;
    db.update(jobs)
      .set({ descriptionError: message, descriptionFetchedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(jobs.id, id))
      .run();
    return { id, ok: false, error: message };
  }
}

const globalForEnrich = globalThis as unknown as { __enriching?: Promise<EnrichResult[]> };

/**
 * Fetches descriptions for every job that has none and was never attempted.
 * Runs jobs one at a time to stay polite to job sites. Concurrent calls share one run.
 */
export function enrichPending(db: Db): Promise<EnrichResult[]> {
  globalForEnrich.__enriching ??= (async () => {
    const pending = db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(isNull(jobs.description), isNull(jobs.descriptionFetchedAt)))
      .all();
    const results: EnrichResult[] = [];
    for (const { id } of pending) results.push(await enrichJob(db, id));
    return results;
  })().finally(() => {
    globalForEnrich.__enriching = undefined;
  });
  return globalForEnrich.__enriching;
}
