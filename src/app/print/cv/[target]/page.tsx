import { notFound } from "next/navigation";
import { CvTemplate } from "@/components/cv-template";
import { getDb } from "@/db";
import { PAPER } from "@/lib/cv/schema";
import { getCv, parseTarget } from "@/lib/cv/store";

export const dynamic = "force-dynamic";

/** Bare CV page that the PDF renderer prints. Also handy to view in a browser. */
export default async function PrintCvPage({ params }: { params: Promise<{ target: string }> }) {
  const target = parseTarget((await params).target);
  const cv = target && getCv(getDb(), target);
  if (!cv) notFound();
  const paper = PAPER[cv.paper];
  return (
    <div className="flex min-h-screen justify-center bg-zinc-200 print:bg-white">
      <style>{`@page { size: ${paper.width}mm ${paper.height}mm; margin: ${paper.margin}mm 0; }`}</style>
      <CvTemplate cv={cv} />
    </div>
  );
}
