import Airtable from "airtable";
import type { Db } from "@/db";
import { upsertJob, type JobInput } from "@/lib/jobs/upsert";

// Candidate Airtable column names for each job field, matched case-insensitively.
// Edit these if your base uses different column names.
const FIELD_CANDIDATES = {
  url: ["url", "link", "job url", "job link", "apply link", "apply url", "posting url"],
  title: ["title", "job title", "role", "position"],
  company: ["company", "company name", "employer"],
  location: ["location", "city", "country"],
  source: ["source", "platform", "site", "board"],
  description: ["description", "job description", "jd", "details"],
  postedAt: ["posted", "posted at", "date posted", "posted date", "date"],
} satisfies Record<string, string[]>;

type MappedField = keyof typeof FIELD_CANDIDATES;
export type FieldMapping = Partial<Record<MappedField, string>>;

export type SyncResult = {
  at: string;
  fetched: number;
  created: number;
  existing: number;
  skipped: number;
  failed: string[];
  error?: string;
};

export function isAirtableConfigured(): boolean {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE } = process.env;
  return Boolean(AIRTABLE_TOKEN && AIRTABLE_BASE_ID && AIRTABLE_TABLE);
}

export function buildMapping(columns: string[]): FieldMapping {
  const byLower = new Map(columns.map((c) => [c.toLowerCase().trim(), c]));
  const mapping: FieldMapping = {};
  for (const [field, candidates] of Object.entries(FIELD_CANDIDATES) as [MappedField, string[]][]) {
    const hit = candidates.find((c) => byLower.has(c));
    if (hit) mapping[field] = byLower.get(hit);
  }
  return mapping;
}

function asText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

/** Reads every row of the configured table and maps it to job inputs. */
export async function fetchAirtableJobs() {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE) {
    throw new Error("Set AIRTABLE_TOKEN, AIRTABLE_BASE_ID and AIRTABLE_TABLE in .env.local");
  }

  const base = new Airtable({ apiKey: AIRTABLE_TOKEN }).base(AIRTABLE_BASE_ID);
  const records = await base(AIRTABLE_TABLE).select().all();

  const columns = [...new Set(records.flatMap((r) => Object.keys(r.fields)))];
  const mapping = buildMapping(columns);
  if (records.length > 0 && (!mapping.url || !mapping.title)) {
    throw new Error(
      `Could not find URL/title columns among: ${columns.join(", ")}. ` +
        "Add your column names to FIELD_CANDIDATES in src/lib/airtable/sync.ts.",
    );
  }
  const mappedColumns = new Set(Object.values(mapping));

  const inputs: JobInput[] = [];
  let skipped = 0;
  for (const record of records) {
    const f = record.fields as Record<string, unknown>;
    const url = asText(f[mapping.url!]);
    const title = asText(f[mapping.title!]);
    if (!url || !title) {
      skipped++;
      continue;
    }
    const extra = Object.fromEntries(Object.entries(f).filter(([k]) => !mappedColumns.has(k)));
    inputs.push({
      airtableId: record.id,
      url,
      title,
      company: mapping.company && asText(f[mapping.company]),
      location: mapping.location && asText(f[mapping.location]),
      source: mapping.source && asText(f[mapping.source]),
      description: mapping.description && asText(f[mapping.description]),
      postedAt: mapping.postedAt && asText(f[mapping.postedAt]),
      extra: Object.keys(extra).length ? extra : undefined,
    });
  }

  return { fetched: records.length, columns, mapping, inputs, skipped };
}

const globalForSync = globalThis as unknown as {
  __airtableLastSync?: SyncResult;
  __airtableSyncing?: Promise<SyncResult>;
};

export function getLastSync(): SyncResult | undefined {
  return globalForSync.__airtableLastSync;
}

/** Pulls Airtable into the local DB. Concurrent calls share one run. Never throws. */
export function syncAirtable(db: Db): Promise<SyncResult> {
  globalForSync.__airtableSyncing ??= runSync(db).finally(() => {
    globalForSync.__airtableSyncing = undefined;
  });
  return globalForSync.__airtableSyncing;
}

async function runSync(db: Db): Promise<SyncResult> {
  const result: SyncResult = {
    at: new Date().toISOString(),
    fetched: 0,
    created: 0,
    existing: 0,
    skipped: 0,
    failed: [],
  };
  try {
    const { fetched, inputs, skipped } = await fetchAirtableJobs();
    result.fetched = fetched;
    result.skipped = skipped;
    for (const input of inputs) {
      try {
        if (upsertJob(db, input, "airtable").created) result.created++;
        else result.existing++;
      } catch (err) {
        result.failed.push(`${input.airtableId} (${input.url}): ${(err as Error).message.split("\n")[0]}`);
      }
    }
  } catch (err) {
    result.error = (err as Error).message;
  }
  globalForSync.__airtableLastSync = result;
  return result;
}
