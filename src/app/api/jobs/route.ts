import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { jobInputSchema, upsertJob } from "@/lib/jobs/upsert";

export const runtime = "nodejs";

const batchSchema = z.array(jobInputSchema).min(1).max(200);

function isAuthorized(req: NextRequest, expected: string): boolean {
  const given = Buffer.from(req.headers.get("x-api-key") ?? "");
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Ingestion endpoint for the Grok bot. Accepts one job or an array of jobs. */
export async function POST(req: NextRequest) {
  const key = process.env.INGEST_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "INGEST_API_KEY is not configured" }, { status: 500 });
  }
  if (!isAuthorized(req, key)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const db = getDb();
  if (Array.isArray(json)) {
    const parsed = batchSchema.safeParse(json);
    if (!parsed.success) return invalid(z.treeifyError(parsed.error));
    const results = parsed.data.map((job) => upsertJob(db, job));
    return NextResponse.json({ results }, { status: 200 });
  }

  const parsed = jobInputSchema.safeParse(json);
  if (!parsed.success) return invalid(z.treeifyError(parsed.error));
  const result = upsertJob(db, parsed.data);
  return NextResponse.json(result, { status: result.created ? 201 : 200 });
}

function invalid(issues: unknown) {
  return NextResponse.json({ error: "Invalid job payload", issues }, { status: 422 });
}
