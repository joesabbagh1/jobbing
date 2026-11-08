import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { letterContext } from "@/lib/letter/context";
import { detectLanguage } from "@/lib/letter/schema";
import { getLetter } from "@/lib/letter/store";
import { LetterEditor } from "./letter-editor";

export const dynamic = "force-dynamic";

export default async function CoverLetterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ generate?: string }>;
}) {
  const id = Number((await params).id);
  const db = getDb();
  const ctx = Number.isInteger(id) ? letterContext(db, id) : undefined;
  if (!ctx) notFound();
  const autoGenerate = "generate" in (await searchParams);

  return (
    <div>
      <PageHeader
        back={{ href: `/jobs/${id}`, label: `${ctx.job.title} · ${ctx.job.company}` }}
        title="Cover letter"
        description={
          ctx.cv ? (
            "Edit freely; the preview on the right is exactly what the PDF looks like."
          ) : (
            <>
              <Link href="/cv" className="underline underline-offset-4">
                Import your CV
              </Link>{" "}
              first: the letter header and the AI draft come from it.
            </>
          )
        }
      />
      <LetterEditor
        jobId={id}
        initial={getLetter(db, id)}
        defaultLanguage={detectLanguage(ctx.job.description ?? "")}
        basics={ctx.cv?.basics ?? { name: "", headline: "", email: "", phone: "", location: "", links: [] }}
        company={ctx.job.company}
        vocabulary={ctx.vocabulary}
        autoGenerate={autoGenerate}
      />
    </div>
  );
}
