import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { applications } from "@/db/schema";

export const runtime = "nodejs";

/** Downloads the exact CV or letter PDF that was sent with an application. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string; kind: string }> }) {
  const { jobId, kind } = await params;
  const app = getDb().select().from(applications).where(eq(applications.jobId, Number(jobId))).get();
  const pdf = kind === "cv" ? app?.cvPdf : kind === "letter" ? app?.letterPdf : undefined;
  const filename = kind === "cv" ? app?.cvFilename : app?.letterFilename;
  if (!pdf || !filename) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${req.nextUrl.searchParams.has("download") ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
}
