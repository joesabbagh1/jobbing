import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { EMPTY_CV } from "@/lib/cv/schema";
import { letterContext, letterCv } from "@/lib/letter/context";
import { detectLanguage } from "@/lib/letter/schema";
import { getLetter } from "@/lib/letter/store";
import { LetterEditor } from "./letter-editor";

export const dynamic = "force-dynamic";

export default async function CoverLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = getDb();
  const ctx = Number.isInteger(id) ? letterContext(db, id) : undefined;
  if (!ctx) notFound();

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
                Create your CV
              </Link>{" "}
              first: the letter header comes from it.
            </>
          )
        }
      />
      <LetterEditor
        jobId={id}
        initial={getLetter(db, id)}
        defaultLanguage={detectLanguage(ctx.job.description ?? "")}
        basics={{
          fr: (letterCv(db, id, "fr") ?? EMPTY_CV).basics,
          en: (letterCv(db, id, "en") ?? EMPTY_CV).basics,
        }}
        company={ctx.job.company}
        vocabulary={ctx.vocabulary}
      />
    </div>
  );
}
