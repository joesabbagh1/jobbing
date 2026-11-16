import { FileUp } from "lucide-react";
import Link from "next/link";
import { CvEditor } from "@/components/cv-editor/cv-editor";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { CV_LANGUAGES, type CvLanguage, LANGUAGE_NAMES } from "@/lib/cv/schema";
import { getExperienceNotes, getMasterCv, masterLanguages, masterTarget, parseLanguage } from "@/lib/cv/store";
import { cn } from "@/lib/utils";
import { ImportForm } from "./import-form";
import { NotesForm } from "./notes-form";

export const dynamic = "force-dynamic";

export default async function MasterCvPage({
  searchParams,
}: {
  searchParams: Promise<{ reimport?: string; lang?: string }>;
}) {
  const params = await searchParams;
  const db = getDb();
  const masters = masterLanguages(db);
  const language = parseLanguage(params.lang) ?? masters[0] ?? CV_LANGUAGES[0];
  const cv = getMasterCv(db, language);
  const reimport = "reimport" in params;
  const tabs = <LanguageTabs active={language} masters={masters} />;

  if (!cv || reimport) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="My CV"
          back={cv ? { href: `/cv?lang=${language}`, label: "Back to editor" } : undefined}
          description="Your master CV holds everything, with one per language you apply in; each job gets its own tailored copy."
          actions={tabs}
        />
        <ImportForm
          key={language}
          language={language}
          replacing={Boolean(cv)}
          copyFrom={cv ? undefined : masters.find((l) => l !== language)}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Master CV"
        description="Everything you've done, one CV per language. Each job gets its own copy to tailor, in the posting's language, so keep extra bullets here and hide them per job."
        actions={
          <>
            {tabs}
            <Link
              href={`/cv?lang=${language}&reimport`}
              className={buttonVariants({ variant: "outline", className: "bg-background" })}
            >
              <FileUp />
              Re-import PDF
            </Link>
          </>
        }
      />
      <NotesForm initial={getExperienceNotes(db)} />
      <CvEditor key={language} initial={cv} target={masterTarget(language)} />
    </div>
  );
}

/** Switches between the master CVs; a language without one opens its import screen. */
function LanguageTabs({ active, masters }: { active: CvLanguage; masters: CvLanguage[] }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1 text-sm">
      {CV_LANGUAGES.map((l) => (
        <Link
          key={l}
          href={`/cv?lang=${l}`}
          className={cn(
            "rounded-md px-2.5 py-1 font-medium transition-colors",
            l === active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            !masters.includes(l) && l !== active && "opacity-50",
          )}
        >
          {LANGUAGE_NAMES[l]}
        </Link>
      ))}
    </div>
  );
}
