import { z } from "zod";
import type { Cv } from "@/lib/cv/schema";
import {
  addedLines,
  cvForPrompt,
  MAX_NOTES_CHARS,
  planLengthHides,
  type Rejected,
  type Relevance,
  type Suggestion,
  validateOperations,
} from "@/lib/cv/tailor";
import { completeJson } from "./deepseek";

const replySchema = z.object({
  operations: z.array(z.unknown()).catch([]),
  relevance: z
    .array(z.object({ id: z.string(), score: z.coerce.number().min(0).max(10), why: z.string().catch("") }))
    .catch([]),
  advice: z.string().catch(""),
});

const SYSTEM = `You tailor a candidate's CV to one job posting by proposing small, safe edits. You may also get the candidate's EXPERIENCE NOTES: their own free-form record of everything they worked on, with details and side projects that aren't on the CV. Use them to bring the experience that best fits this posting onto the CV.

1. "relevance": score EVERY visible bullet (the [id=...] lines under experience and projects) from 0 to 10 for how much it helps this specific application, with a short English "why". The app uses these scores to decide what to cut when the CV is too long, so be discriminating: use the whole range.

2. "operations": a few high-impact edits, each referencing an existing [id=...]:
- {"op":"move","id":...,"position":N}  move a bullet within its job/project, or an entry within its section, to 0-based position N (most relevant first)
- {"op":"rewrite","id":...,"text":...}  reword ONE bullet, the summary, the headline, a project description, or a skill group's comma-separated list
- {"op":"hide","id":...}  hide a whole entry, project, skill group or certification that is clearly irrelevant to this job (not individual bullets: the app trims bullets from your relevance scores)
- {"op":"show","id":...}  un-hide something currently hidden that is highly relevant
- {"op":"add","id":...,"text":...}  add ONE new bullet to an existing job or project (its [id=...]), built only from what the EXPERIENCE NOTES say about that same job or project
- {"op":"addProject","name":...,"description":...,"bullets":[...]}  add a side project from the EXPERIENCE NOTES that isn't on the CV yet, only if it's clearly relevant to this posting (one-line description, at most 2 short bullets)
Every operation must include "reason": one short sentence in ENGLISH tied to the job posting.

Hard rules — never break these:
- Never invent experience, tools, numbers, employers, certifications or skills. Everything must come from the CV or the EXPERIENCE NOTES. A rewrite may rephrase what that item says and add details the notes give about that same job or project, using the posting's vocabulary where the CV or notes genuinely support it.
- Never move a fact from one job or project to another: what the notes say about job A only goes into job A.
- Keep every number exactly as it appears in the CV or the notes. Do not add numbers.
- A skill-group rewrite may only reorder or drop items, or add skills the CV or the notes show the candidate actually used.
- Without EXPERIENCE NOTES, never use "add" or "addProject".
- The CV should stay one page: prefer adding a strong, relevant bullet from the notes and letting weaker bullets get low relevance scores (the app cuts those) over simply making the CV longer.
- Write rewrites in the CV's language (the CV language is given below), even if the posting is in another language.
- Keep rewrites about as long as the original or shorter. No buzzword stuffing.
- At most 12 operations. Don't touch items that already fit. Never hide the candidate's current job, languages or interests.

Reply in JSON: {"relevance":[{"id","score","why"}], "operations":[...], "advice":"2-3 sentences of honest advice for this application (e.g. gaps to address in the cover letter). Write the advice in ENGLISH."}.`;

// A page holds ~65 lines in the CV template (9pt Times, 0.5in margins); aim slightly past the overflow since line
// estimates are rough.
const LINES_PER_PAGE = 65;
const SAFETY_MARGIN = 1.1;

export type TailoringResult = { suggestions: Suggestion[]; rejected: Rejected[]; advice: string; pages?: number };

export async function suggestTailoring(input: {
  cv: Cv;
  jobTitle: string;
  company: string;
  description: string;
  /** Measured length of the CV in A4 pages (e.g. 1.35). */
  pages?: number;
  /** The candidate's free-form notes on everything they worked on. */
  notes?: string;
}): Promise<TailoringResult> {
  const notes = input.notes?.trim().slice(0, MAX_NOTES_CHARS) ?? "";
  const user = [
    `CV LANGUAGE: ${input.cv.language === "fr" ? "French" : "English"}`,
    `CV:\n${cvForPrompt(input.cv)}`,
    ...(notes ? [`EXPERIENCE NOTES:\n${notes}`] : []),
    `JOB: ${input.jobTitle} at ${input.company}`,
    `POSTING:\n${input.description.slice(0, 9000)}`,
  ].join("\n\n");

  const reply = await completeJson({ system: SYSTEM, user, schema: replySchema, temperature: 0.3 });

  const tooLong = (input.pages ?? 0) > 1;
  const oneLine = new Set([...input.cv.languages, ...input.cv.interests].map((i) => i.id));
  const bulletIds = new Set([...input.cv.experience, ...input.cv.projects].flatMap((e) => e.bullets.map((b) => b.id)));
  const modelOps = reply.operations.filter((o) => {
    const { op, id } = (o ?? {}) as { op?: string; id?: string };
    if (op === "hide" && (oneLine.has(String(id)) || bulletIds.has(String(id)))) return false; // bullets: we decide
    if (op === "show" && tooLong) return false; // don't grow a CV that's already too long
    return true;
  });

  const edits = validateOperations(input.cv, modelOps, input.jobTitle, notes);

  // Length: hide the least relevant bullets until the measured overflow, plus whatever the additions bring, is gone.
  const relevance = new Map<string, Relevance>(reply.relevance.map((r) => [r.id, { score: r.score, why: r.why }]));
  const added = edits.suggestions.reduce((n, s) => n + addedLines(s), 0);
  const overflow = input.pages === undefined ? 0 : (input.pages - 1) * LINES_PER_PAGE + added;
  const linesNeeded = overflow > 0 ? Math.ceil(overflow * SAFETY_MARGIN) : 0;
  const lengthOps = planLengthHides(input.cv, relevance, linesNeeded);
  const trims = validateOperations(input.cv, lengthOps, input.jobTitle, notes);

  const keys = new Set(edits.suggestions.map((s) => s.key));
  return {
    suggestions: [...edits.suggestions, ...trims.suggestions.filter((s) => !keys.has(s.key))],
    rejected: [...edits.rejected, ...trims.rejected],
    advice: reply.advice,
    pages: input.pages,
  };
}
