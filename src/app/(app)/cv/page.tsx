import { FileUp } from "lucide-react";
import Link from "next/link";
import { CvEditor } from "@/components/cv-editor/cv-editor";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { getExperienceNotes, getMasterCv } from "@/lib/cv/store";
import { ImportForm } from "./import-form";
import { NotesForm } from "./notes-form";

export const dynamic = "force-dynamic";

export default async function MasterCvPage({ searchParams }: { searchParams: Promise<{ reimport?: string }> }) {
  const cv = getMasterCv(getDb());
  const reimport = "reimport" in (await searchParams);

  if (!cv || reimport) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="My CV"
          back={cv ? { href: "/cv", label: "Back to editor" } : undefined}
          description="Your master CV holds everything; each job gets its own tailored copy."
        />
        <ImportForm replacing={Boolean(cv)} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Master CV"
        description="Everything you've done. Each job gets its own copy to tailor, so keep extra bullets here and hide them per job."
        actions={
          <Link href="/cv?reimport" className={buttonVariants({ variant: "outline", className: "bg-background" })}>
            <FileUp />
            Re-import PDF
          </Link>
        }
      />
      <NotesForm initial={getExperienceNotes(getDb())} />
      <CvEditor initial={cv} target="master" />
    </div>
  );
}
