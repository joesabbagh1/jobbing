import type { Cv } from "@/lib/cv/schema";
import { formatLetterDate, LETTER_LABELS, type Letter } from "@/lib/letter/schema";

// Same page size, font and header as the CV so the two documents look like a set.

export function LetterTemplate({
  letter,
  basics,
  company,
  date = new Date(),
}: {
  letter: Letter;
  basics: Cv["basics"];
  company: string;
  date?: Date;
}) {
  const labels = LETTER_LABELS[letter.language];
  const contact = [basics.location, basics.email, basics.phone].filter(Boolean);
  const city = basics.location.split(",")[0]?.trim();
  const dateLine =
    letter.language === "fr"
      ? `${city ? `${city}, le ` : ""}${formatLetterDate("fr", date)}`
      : `${city ? `${city}, ` : ""}${formatLetterDate("en", date)}`;
  const paragraphs = letter.body.split(/\n\s*\n/).filter((p) => p.trim());

  return (
    <article
      lang={letter.language}
      className="cv-page bg-white px-[20mm] font-[Arial,Helvetica,sans-serif] text-[10.5pt] leading-[1.5] text-zinc-800"
    >
      <header>
        <p className="text-[16pt] leading-tight font-bold text-zinc-900">{basics.name || "Your Name"}</p>
        {basics.headline && <p className="text-zinc-700">{basics.headline}</p>}
        {contact.length > 0 && <p className="text-[9.5pt] text-zinc-600">{contact.join("  ·  ")}</p>}
      </header>

      <div className="mt-[10mm] flex items-start justify-between gap-8">
        <div>
          <p className="font-bold text-zinc-900">{company}</p>
          <p>{labels.recipient}</p>
        </div>
        <p className="shrink-0 text-zinc-600">{dateLine}</p>
      </div>

      {letter.subject && (
        <p className="mt-[8mm] font-bold text-zinc-900">
          {labels.subjectPrefix} {letter.subject}
        </p>
      )}

      <div className="mt-[6mm] space-y-[3.5mm]">
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p.trim()}
          </p>
        ))}
      </div>

      <p className="mt-[8mm] font-bold text-zinc-900">{basics.name}</p>
    </article>
  );
}
