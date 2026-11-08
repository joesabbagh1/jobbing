import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { documentFilename } from "@/lib/filename";
import { letterContext } from "@/lib/letter/context";
import { getLetter } from "@/lib/letter/store";
import { pdfResponse } from "@/lib/pdf-response";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const jobId = Number((await params).jobId);
  const db = getDb();
  const ctx = Number.isInteger(jobId) ? letterContext(db, jobId) : undefined;
  if (!ctx || !getLetter(db, jobId)) return NextResponse.json({ error: "Cover letter not found" }, { status: 404 });

  const kind = getLetter(db, jobId)!.language === "fr" ? "Lettre_de_motivation" : "Cover_Letter";
  return pdfResponse(req, `/print/letter/${jobId}`, documentFilename(ctx.cv?.basics.name ?? "", kind, ctx.job.company));
}
