import { unknownTerms } from "@/lib/cv/tailor";

/**
 * Things in a cover letter that aren't backed by the CV, the profile or the posting:
 * numbers (often invented metrics) and technical terms. Shown live as the letter is edited.
 */
// Standard letter words that are capitalised but aren't claims.
const LETTER_WORDS = "madame monsieur mesdames messieurs dear hiring team manager kind regards best cordialement sincerely";

export function letterWarnings(text: string, vocabulary: string): string[] {
  const numbers = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => !vocabulary.includes(n));
  const terms = unknownTerms(text, vocabulary, LETTER_WORDS).filter((t) => !/^\d+(?:[.,]\d+)?$/.test(t)); // numbers handled above
  return [
    ...new Set([...numbers.map((n) => `the number ${n}`), ...terms]),
  ];
}
