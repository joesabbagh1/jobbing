import { notFound } from "next/navigation";
import { LetterTemplate } from "@/components/letter-template";
import { getDb } from "@/db";
import { EMPTY_CV } from "@/lib/cv/schema";
import { letterContext } from "@/lib/letter/context";
import { getLetter } from "@/lib/letter/store";

export const dynamic = "force-dynamic";

/** Bare cover letter page that the PDF renderer prints. */
export default async function PrintLetterPage({ params }: { params: Promise<{ jobId: string }> }) {
  const jobId = Number((await params).jobId);
  const db = getDb();
  const ctx = Number.isInteger(jobId) ? letterContext(db, jobId) : undefined;
  const letter = ctx && getLetter(db, jobId);
  if (!ctx || !letter) notFound();
  return (
    <div className="flex min-h-screen justify-center bg-zinc-200 print:bg-white">
      <style>{"@page { size: A4; margin: 13mm 0; }"}</style>
      <LetterTemplate letter={letter} basics={(ctx.cv ?? EMPTY_CV).basics} company={ctx.job.company} />
    </div>
  );
}
