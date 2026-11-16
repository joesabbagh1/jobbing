import { inventedNumbers, unknownTerms } from "@/lib/cv/tailor";

// Standard letter words that are capitalised but aren't claims.
const LETTER_WORDS = "madame monsieur mesdames messieurs dear hiring team manager kind regards best cordialement sincerely";

/** Lowercased text a letter may draw on: the candidate's own material, and the posting. */
export type LetterVocabulary = { own: string; posting: string };

export type LetterWarnings = {
  /** Numbers (often invented metrics) and technical terms backed by nothing: not the CV, notes, profile or posting. */
  unknown: string[];
  /** Technical terms only the posting uses: fine for describing the role, not as the candidate's own experience. */
  fromPosting: string[];
};

/** Things in a cover letter that the candidate's own material doesn't back. Shown live as the letter is edited. */
export function letterWarnings(text: string, vocabulary: LetterVocabulary): LetterWarnings {
  const numbers = inventedNumbers(text, `${vocabulary.own}\n${vocabulary.posting}`);
  const terms = unknownTerms(text, vocabulary.own, LETTER_WORDS).filter((t) => !/^\d+(?:[.,]\d+)?$/.test(t)); // numbers handled above
  const fromPosting = terms.filter((t) => vocabulary.posting.includes(t.toLowerCase()));
  return {
    unknown: [...new Set([...numbers.map((n) => `the number ${n}`), ...terms.filter((t) => !fromPosting.includes(t))])],
    fromPosting,
  };
}
