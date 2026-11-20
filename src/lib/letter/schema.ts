import { z } from "zod";

export const letterSchema = z.object({
  language: z.enum(["en", "fr"]).default("en"),
  /** e.g. "Candidature – Ingénieur DevOps". */
  subject: z.string().default(""),
  /** Greeting, paragraphs and closing, separated by blank lines. */
  body: z.string().default(""),
});
export type Letter = z.infer<typeof letterSchema>;

export const LETTER_LABELS = {
  en: { subjectPrefix: "Subject:", recipient: "Hiring team" },
  fr: { subjectPrefix: "Objet :", recipient: "Service recrutement" },
} as const;

const FRENCH_WORDS = /\b(le|la|les|des|du|une|et|pour|avec|vous|nous|est|dans|sur|votre|notre|poste|équipe|expérience)\b/gi;
const ENGLISH_WORDS = /\b(the|and|for|with|you|we|our|your|is|are|in|on|role|team|experience|will)\b/gi;

/** Guesses whether a job posting is in French or English. */
export function detectLanguage(text: string): "en" | "fr" {
  const sample = text.slice(0, 4000);
  const fr = sample.match(FRENCH_WORDS)?.length ?? 0;
  const en = sample.match(ENGLISH_WORDS)?.length ?? 0;
  return fr > en ? "fr" : "en";
}

/** The posting's language, or undefined when there's no description to tell from. */
export function postingLanguage(description: string | null): "en" | "fr" | undefined {
  return description?.trim() ? detectLanguage(description) : undefined;
}

/** Letter date, e.g. "2 novembre 2026" / "2 November 2026". */
export function formatLetterDate(language: "en" | "fr", date = new Date()): string {
  return date.toLocaleDateString(language === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * The letter as plain text for pasting into an application form: paragraphs separated by one blank line, then the
 * candidate's name. Copying from the PDF instead breaks every line at the page width and loses paragraph gaps.
 */
export function letterPlainText(letter: Pick<Letter, "body">, name?: string): string {
  return [letter.body.trim().replace(/\n\s*\n/g, "\n\n"), name?.trim()].filter(Boolean).join("\n");
}
