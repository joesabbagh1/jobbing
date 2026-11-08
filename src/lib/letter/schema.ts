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

/** Letter date, e.g. "2 novembre 2026" / "2 November 2026". */
export function formatLetterDate(language: "en" | "fr", date = new Date()): string {
  return date.toLocaleDateString(language === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}
