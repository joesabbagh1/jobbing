import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { getCv, parseTarget } from "@/lib/cv/store";
import { documentFilename } from "@/lib/filename";
import { pdfResponse } from "@/lib/pdf-response";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ target: string }> }) {
  const raw = (await params).target;
  const target = parseTarget(raw);
  const db = getDb();
  const cv = target && getCv(db, target);
  if (!target || !cv) return NextResponse.json({ error: "CV not found" }, { status: 404 });

  const company = target === "master" ? undefined : db.select().from(jobs).where(eq(jobs.id, target)).get()?.company;
  return pdfResponse(req, `/print/cv/${raw}`, documentFilename(cv.basics.name, "CV", company));
}

