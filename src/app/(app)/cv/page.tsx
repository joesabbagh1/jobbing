import { Copy } from "lucide-react";
import Link from "next/link";
import { CvEditor } from "@/components/cv-editor/cv-editor";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { copyMasterCv, startBlankCv } from "@/lib/cv/actions";
import { CV_LANGUAGES, type CvLanguage, LANGUAGE_NAMES } from "@/lib/cv/schema";
import { getExperienceNotes, getMasterCv, masterLanguages, masterTarget, parseLanguage } from "@/lib/cv/store";
import { cn } from "@/lib/utils";
import { NotesForm } from "./notes-form";

export const dynamic = "force-dynamic";

export default async function MasterCvPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const params = await searchParams;
  const db = getDb();
  const masters = masterLanguages(db);
  const language = parseLanguage(params.lang) ?? masters[0] ?? CV_LANGUAGES[0];
  const cv = getMasterCv(db, language);
  const tabs = <LanguageTabs active={language} masters={masters} />;

  if (!cv) {
    const copyFrom = masters.find((l) => l !== language);
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="My CV"
          description="Your master CV holds everything, with one per language you apply in; each job gets its own tailored copy."
          actions={tabs}
        />
        <Card>
          <CardHeader>
            <CardTitle>Start your {LANGUAGE_NAMES[language]} CV</CardTitle>
            <CardDescription>
              {copyFrom
                ? `Start from a copy of your ${LANGUAGE_NAMES[copyFrom]} CV and translate it in the editor, or from a blank one.`
                : "Start from a blank CV and fill it in with the editor."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {copyFrom && (
              <form action={copyMasterCv.bind(null, copyFrom, language)}>
                <SubmitButton>
                  <Copy />
                  Copy my {LANGUAGE_NAMES[copyFrom]} CV
                </SubmitButton>
              </form>
            )}
            <form action={startBlankCv.bind(null, language)}>
              <SubmitButton variant={copyFrom ? "outline" : "default"}>Start from a blank CV</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Master CV"
        description="Everything you've done, one CV per language. Each job gets its own copy to tailor, in the posting's language, so keep extra bullets here and hide them per job."
        actions={tabs}
      />
      <NotesForm initial={getExperienceNotes(db)} />
      <CvEditor key={language} initial={cv} target={masterTarget(language)} />
    </div>
  );
}

/** Switches between the master CVs; a language without one opens its start screen. */
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
