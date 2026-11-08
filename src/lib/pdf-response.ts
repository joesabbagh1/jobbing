import { type NextRequest, NextResponse } from "next/server";
import { renderPdf } from "@/lib/cv/pdf";

/** Renders one of the app's print pages to PDF; `?download` makes the browser save it. */
export async function pdfResponse(req: NextRequest, printPath: string, filename: string) {
  try {
    const pdf = await renderPdf(new URL(printPath, req.nextUrl.origin).toString());
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${req.nextUrl.searchParams.has("download") ? "attachment" : "inline"}; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
