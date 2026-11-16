"use client";

import { Download, Wand2 } from "lucide-react";
import { useState } from "react";
import { AppSelect } from "@/components/app-select";
import { SubmitButton } from "@/components/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { createTailoredCv, tailorWithAi } from "@/lib/cv/actions";
import { type CvLanguage, LANGUAGE_NAMES } from "@/lib/cv/schema";

/** Starts a job's CV as a copy of a master CV, in the language picked here when there's more than one. */
export function StartCvButtons({
  jobId,
  languages,
  defaultLanguage,
  canTailor,
}: {
  jobId: number;
  /** Languages that have a master CV. */
  languages: CvLanguage[];
  defaultLanguage: CvLanguage;
  /** The job has a description, so the AI can tailor against it. */
  canTailor: boolean;
}) {
  const [language, setLanguage] = useState(defaultLanguage);
  const field = <input type="hidden" name="language" value={language} />;
  return (
    <>
      {languages.length > 1 && (
        <AppSelect
          aria-label="CV language"
          value={language}
          onValueChange={(v) => setLanguage(v as CvLanguage)}
          options={languages.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))}
          size="sm"
          className="min-w-24"
        />
      )}
      {canTailor && (
        <form action={tailorWithAi.bind(null, jobId)}>
          {field}
          <SubmitButton size="sm">
            <Wand2 />
            Tailor with AI
          </SubmitButton>
        </form>
      )}
      <form action={createTailoredCv.bind(null, jobId)}>
        {field}
        <SubmitButton size="sm" variant="outline">
          {canTailor ? "Manually" : "Tailor CV"}
        </SubmitButton>
      </form>
      <a
        href={`/api/cv/master-${language}/pdf?download`}
        aria-label={`Download ${LANGUAGE_NAMES[language]} master CV`}
        className={buttonVariants({ size: "icon-sm", variant: "ghost", className: "text-muted-foreground" })}
      >
        <Download />
      </a>
    </>
  );
}
