import type { Cv } from "./schema";

// Checks that a text (a cover letter) only states facts the candidate's own material backs: numbers and technical
// terms found nowhere in the CV or notes get flagged for review.

/** Lowercased text of a CV, leaving out ids and flags: random ids contain digits that would make invented numbers look "known". */
export function cvVocabulary(cv: Cv): string {
  return JSON.stringify(cv, (k, v) => (k === "id" || k === "hidden" || k === "language" ? undefined : v)).toLowerCase();
}

/** Standalone numbers in a text ("100", "2.5"). Digits glued to letters (EC2, K8s) are part of a name, not a number. */
export const numbersIn = (s: string) =>
  (s.match(/(?<![\p{L}\d])\d+(?:[.,]\d+)?(?![\p{L}\d])/gu) ?? []).map((n) => n.replace(",", "."));

// Small numbers are often spelled out in notes ("fixed it in about five minutes"). One/un is left out: it's also an article.
const NUMBER_WORDS: Record<string, string> = Object.fromEntries(
  ["two deux", "three trois", "four quatre", "five cinq", "six", "seven sept", "eight huit", "nine neuf", "ten dix", "eleven onze", "twelve douze"]
    .flatMap((words, i) => words.split(" ").map((w) => [w, String(i + 2)])),
);

/** Numbers in `text` that `source` doesn't contain as numbers of their own ("16" isn't backed by "2016"). */
export function inventedNumbers(text: string, source: string): string[] {
  const spelled = (source.toLowerCase().match(/\p{L}+/gu) ?? []).flatMap((w) => NUMBER_WORDS[w] ?? []);
  const known = new Set([...numbersIn(source), ...spelled]);
  return [...new Set(numbersIn(text).filter((n) => !known.has(n)))];
}

/** Capitalised / technical-looking terms (AWS, Terraform, CI/CD, K8s) not found anywhere in `vocabulary`. */
export function unknownTerms(text: string, vocabulary: string, allowed = ""): string[] {
  const extra = allowed.toLowerCase();
  const terms = new Set<string>();
  for (const sentence of text.split(/(?<=[.!?:;])\s+|\n/)) {
    const words = sentence.match(/[\p{L}\p{N}][\p{L}\p{N}+#./-]*[\p{L}\p{N}+#]|[\p{L}\p{N}]/gu) ?? [];
    words.forEach((w, i) => {
      // A slash joins plain words too ("pause/reprise"): it only makes a term technical next to a name ("CI/CD").
      const slashName =
        w.includes("/") && w.split("/").some((part, k) => /\d/.test(part) || (/^\p{Lu}/u.test(part) && (i > 0 || k > 0)));
      const technical = /\d|[+#]/.test(w) || slashName || (/^\p{Lu}/u.test(w) && i > 0) || /^\p{Lu}{2,}$/u.test(w);
      const lower = w.toLowerCase();
      if (technical && w.length > 1 && !vocabulary.includes(lower) && !extra.includes(lower)) terms.add(w);
    });
  }
  return [...terms];
}
