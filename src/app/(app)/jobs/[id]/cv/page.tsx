import { eq } from "drizzle-orm";
import { ChevronRight, FileText } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { CvEditor } from "@/components/cv-editor/cv-editor";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { getTailoredCv } from "@/lib/cv/store";

export const dynamic = "force-dynamic";

export default async function TailoredCvPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ suggest?: string }>;
}) {
  const id = Number((await params).id);
  const autoSuggest = "suggest" in (await searchParams);
  const db = getDb();
  const job = Number.isInteger(id) ? db.select().from(jobs).where(eq(jobs.id, id)).get() : undefined;
  if (!job) notFound();
  const cv = getTailoredCv(db, id);
  if (!cv) redirect(`/jobs/${id}`);

  return (
    <div>
      <PageHeader
        back={{ href: `/jobs/${id}`, label: `${job.title} · ${job.company}` }}
        title="Tailored CV"
        description="Changes here only affect this job. Your master CV stays untouched."
      />
      <CvEditor
        initial={cv}
        target={id}
        autoSuggest={autoSuggest}
        aside={
          job.description ? (
            <details className="group/jd rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-open/jd:rotate-90" />
                <FileText className="size-4 text-muted-foreground" />
                Job description
              </summary>
              <div className="border-t px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                {job.description}
              </div>
            </details>
          ) : null
        }
      />
    </div>
  );
}
