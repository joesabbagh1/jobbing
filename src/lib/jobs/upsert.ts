import { eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { jobs, type JobOrigin } from "@/db/schema";
import { normalizeJobUrl } from "./normalize-url";

const optionalText = z
  .string()
  .trim()
  .transform((s) => s || undefined)
  .nullish();

export const jobInputSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().trim().min(1),
  company: optionalText,
  location: optionalText,
  source: optionalText,
  description: optionalText,
  postedAt: optionalText,
  airtableId: optionalText,
  extra: z.record(z.string(), z.unknown()).nullish(),
});
export type JobInput = z.input<typeof jobInputSchema>;

/**
 * Inserts a job, or fills gaps on an existing one (same normalized URL or Airtable ID).
 * Never overwrites data already present, so the user's status and notes are safe.
 */
export function upsertJob(
  db: Db,
  input: JobInput,
  origin: JobOrigin = "api",
): { id: number; created: boolean } {
  const data = jobInputSchema.parse(input);
  const url = normalizeJobUrl(data.url);

  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(jobs)
      .where(
        data.airtableId
          ? or(eq(jobs.url, url), eq(jobs.airtableId, data.airtableId))
          : eq(jobs.url, url),
      )
      .get();

    if (!existing) {
      const row = tx
        .insert(jobs)
        .values({
          url,
          title: data.title,
          company: data.company ?? "",
          location: data.location,
          source: data.source,
          description: data.description,
          postedAt: data.postedAt,
          airtableId: data.airtableId,
          extra: data.extra ?? undefined,
          origin,
        })
        .returning({ id: jobs.id })
        .get();
      return { id: row.id, created: true };
    }

    const patch: Partial<typeof jobs.$inferInsert> = {};
    if (!existing.company && data.company) patch.company = data.company;
    if (!existing.location && data.location) patch.location = data.location;
    if (!existing.source && data.source) patch.source = data.source;
    if (!existing.description && data.description) patch.description = data.description;
    if (!existing.postedAt && data.postedAt) patch.postedAt = data.postedAt;
    if (!existing.airtableId && data.airtableId) patch.airtableId = data.airtableId;
    if (data.extra) patch.extra = { ...data.extra, ...existing.extra };

    if (Object.keys(patch).length > 0) {
      tx.update(jobs)
        .set({ ...patch, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(jobs.id, existing.id))
        .run();
    }
    return { id: existing.id, created: false };
  });
}
