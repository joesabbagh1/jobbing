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

const REQUIREMENT_STATUSES = ["shown", "buried", "gap"] as const;

const replySchema = z.object({
  requirements: z
    .array(
      z.object({
        need: z.string(),
        evidence: z.string().catch(""),
        status: z.enum(REQUIREMENT_STATUSES).catch("buried"),
      }),
    )
    .catch([]),
  operations: z.array(z.unknown()).catch([]),
  relevance: z
    .array(z.object({ id: z.string(), score: z.coerce.number().min(0).max(10), why: z.string().catch("") }))
    .catch([]),
  advice: z.string().catch(""),
});

/** One thing the posting wants, and whether the CV shows the candidate has it. */
export type Requirement = z.infer<typeof replySchema>["requirements"][number];

const HARD_RULES = `Hard rules — never break these:
- Every fact must come from the CV or the EXPERIENCE NOTES. Never invent experience, tools, numbers, employers, certifications or skills, and never claim a tool just because the posting names it.
- A fact stays with its own job or project: what the notes say under one "#" section only goes into that CV entry.
- Keep every number exactly as it appears in the CV or the notes, qualifier included: "3 ans" never becomes "plus de 3 ans". Do not add numbers. Never write dates or years into a bullet: each entry's dates are fixed.
- Keep each fact's status: ongoing work stays ongoing, a degree not yet obtained stays in the future, "contributed to" never becomes "led". Never give the candidate a job title they haven't held (consultant, senior, lead, architect...).
- A skill-group rewrite may only reorder or drop items, or add skills the CV or the notes show the candidate actually used.
- Without EXPERIENCE NOTES, never use "add" or "addProject".
- A rewrite swaps vague wording for the specific fact. It does not append a clause to the old sentence ("..., avec ...", "..., améliorant ..."), and never states a benefit or context the CV and notes don't state.
- The CV must stay one page. A rewritten bullet keeps the number of printed lines of the original (see its [~N lines] mark); a new bullet is one or two lines (at most 220 characters). When you add a bullet, give the bullets it outranks low relevance scores (the app cuts those).
- Write in the CV's language (given below), even if the posting is in another language. Start every bullet with an action verb in the same form as the existing ones (in French, a past participle such as "Migré", "Automatisé"), never with a noun. No buzzword lists, no "expertise en ...", no adjectives about the candidate.`;

const SYSTEM = `You tailor a candidate's CV to one job posting. You get the POSTING, the CV (every item has an [id=...]) and, usually, the candidate's EXPERIENCE NOTES: their own record of everything they did, far more detailed than the CV. Each "#" section of the notes is one CV entry (same company or project).

A recruiter skims a CV for a few seconds looking for the posting's own words. Your job is to make the candidate's true, relevant experience impossible to miss. Reordering alone is not tailoring.

Work in this order and return all of it in one JSON object.

1. "requirements": the 5 to 8 things this posting most wants (tools, responsibilities, domain, seniority), most important first. Each: {"need": short phrase in the posting's own words, "evidence": where the proof is, in plain English without ids (e.g. "Purple Edge: ECS Fargate with Terraform, in the notes only"), "" if none, "status": "shown" | "buried" | "gap"}.
- shown: the CV already makes it obvious near the top.
- buried: true according to the CV or the notes, but missing from the CV, vague, or far down.
- gap: no evidence anywhere. Never write a gap onto the CV.

2. "operations": edits that fix every "buried" requirement, each referencing an existing [id=...]:
- {"op":"rewrite","id":...,"text":...}  reword ONE bullet, the summary, the headline, a project description, or a skill group's comma-separated list. Make a vague bullet concrete with details the notes give about that same entry, and use the posting's name for a tool or practice when the CV or notes show the candidate did exactly that. If the headline is empty, write one: the candidate's real role, worded close to the posting's title. Rewrite the summary only by changing which skills its first sentence names (the 2-3 top requirements the candidate really has): keep its other sentences and its length. For a skill group, "text" is only the comma-separated items, without the group's name: the posting's tools first, the ones irrelevant to this job dropped, every skill kept in its own group.
- {"op":"add","id":...,"text":...}  add ONE new bullet to an existing job or project (its [id=...]), built only from what the EXPERIENCE NOTES say about that same job or project. Use it when the notes hold strong evidence for a top requirement that the CV lacks. Never add a bullet that repeats what a bullet of that entry, or one of your rewrites, already says. At most 3.
- {"op":"addProject","name":...,"description":...,"bullets":[...]}  add a side project from the EXPERIENCE NOTES that isn't on the CV yet, only if it's clearly relevant to this posting (one-line description, at most 2 short bullets)
- {"op":"hide","id":...}  hide a whole entry, project, skill group or certification that is clearly irrelevant to this job (not individual bullets: the app trims bullets from your relevance scores)
- {"op":"show","id":...}  un-hide something currently hidden that is highly relevant
- {"op":"move","id":...,"position":N}  move a bullet within its job/project, or a project or skill group within its section, to 0-based position N. Only for an item whose position really changes: never list items that stay where they are. Jobs and education stay in date order. At most 4 moves.
Every operation must include "reason": one short sentence in ENGLISH naming the requirement it serves.
Aim for 6 to 10 operations, most of them "rewrite" or "add". Leave alone what already serves the posting well. Never hide the candidate's current job, languages or interests.
LENGTH tells you how full the page is. From 0.9 up it is full: every printed line you add makes the app cut another bullet, so add a bullet only when it is stronger evidence for this posting than the weakest bullet on the CV.

3. "relevance": score EVERY visible bullet (the [id=...] lines under experience and projects) from 0 to 10 for how much it helps this specific application, with a short English "why". The app uses these scores to decide what to cut when the CV is too long, so use the whole range: a bullet that proves a top requirement is 9-10, one a recruiter for this job would skip is 0-3.

4. "advice": 2-3 sentences of honest advice in ENGLISH on the real gaps and how to handle them (e.g. in the cover letter).

The candidate may give you INSTRUCTIONS (e.g. "make the Acme bullets shorter", "don't touch the summary"). Follow them: they override your own preferences, including the number of operations, but never the hard rules.

${HARD_RULES}

Language: the "text" of an operation is in the CV's language. Everything else you write ("evidence", "reason", "why", "advice") is in English.

Reply in JSON: {"requirements":[{"need","evidence","status"}], "operations":[...], "relevance":[{"id","score","why"}], "advice":"..."}.`;

const REFINE_SYSTEM = `You tailor a candidate's CV to one job posting. You proposed one edit and the candidate commented on it. Return a revised version of that same edit that follows their comment.

Keep the same "op" and "id" (for "addProject", the same project from the notes). Include "reason": one short sentence in ENGLISH tied to the job posting.

${HARD_RULES}

Reply in JSON: {"operation":{...}}.`;

// A page holds ~65 lines in the CV template (9pt Times, 0.5in margins); aim slightly past the overflow since line
// estimates are rough.
const LINES_PER_PAGE = 65;
const SAFETY_MARGIN = 1.1;

export type TailoringResult = {
  /** What the posting wants and how well the CV shows it, most important first. */
  requirements: Requirement[];
  suggestions: Suggestion[];
  rejected: Rejected[];
  advice: string;
  pages?: number;
  /** Something the candidate should know about this run, e.g. that the posting text is too short to tailor against. */
  warning?: string;
};

type JobContext = {
  cv: Cv;
  jobTitle: string;
  company: string;
  description: string;
  /** The candidate's free-form notes on everything they worked on. */
  notes?: string;
};

/** The posting, CV and notes as the prompt's user message. */
function promptContext(input: JobContext, notes: string): string[] {
  return [
    `JOB: ${input.jobTitle} at ${input.company}`,
    `POSTING:\n${input.description.slice(0, 9000)}`,
    `CV LANGUAGE: ${input.cv.language === "fr" ? "French" : "English"}`,
    `CV:\n${cvForPrompt(input.cv)}`,
    ...(notes ? [`EXPERIENCE NOTES:\n${notes}`] : []),
  ];
}

export async function suggestTailoring(
  input: JobContext & {
    /** Measured length of the CV in A4 pages (e.g. 1.35). */
    pages?: number;
    /** What the candidate wants from this run, e.g. "keep bullets to one line". */
    instructions?: string;
  },
): Promise<TailoringResult> {
  const notes = input.notes?.trim().slice(0, MAX_NOTES_CHARS) ?? "";
  const instructions = input.instructions?.trim().slice(0, 2000) ?? "";
  const user = [
    ...promptContext(input, notes),
    ...(input.pages === undefined ? [] : [`LENGTH: the CV fills ${input.pages.toFixed(2)} of one page.`]),
    ...(instructions ? [`INSTRUCTIONS:\n${instructions}`] : []),
  ].join("\n\n");

  const reply = await completeJson({ system: SYSTEM, user, schema: replySchema, temperature: 0.3, writing: true });

  const tooLong = (input.pages ?? 0) > 1;
  const oneLine = new Set([...input.cv.languages, ...input.cv.interests].map((i) => i.id));
  const bulletIds = new Set([...input.cv.experience, ...input.cv.projects].flatMap((e) => e.bullets.map((b) => b.id)));
  const modelOps = reply.operations.filter((o) => {
    const { op, id } = (o ?? {}) as { op?: string; id?: string };
    if (op === "hide" && (oneLine.has(String(id)) || bulletIds.has(String(id)))) return false; // bullets: we decide
    if (op === "show" && tooLong) return false; // don't grow a CV that's already too long
    return true;
  });

  const edits = validateOperations(input.cv, modelOps, notes);

  // Length: hide the least relevant bullets until the measured overflow, plus whatever the edits add, is gone.
  const relevance = new Map<string, Relevance>(reply.relevance.map((r) => [r.id, { score: r.score, why: r.why }]));
  const added = edits.suggestions.reduce((n, s) => n + addedLines(s), 0);
  const overflow = input.pages === undefined ? 0 : (input.pages - 1) * LINES_PER_PAGE + added;
  const linesNeeded = overflow > 0 ? Math.ceil(overflow * SAFETY_MARGIN) : 0;
  const lengthOps = planLengthHides(input.cv, relevance, linesNeeded);
  const trims = validateOperations(input.cv, lengthOps, notes);

  const keys = new Set(edits.suggestions.map((s) => s.key));
  return {
    requirements: reply.requirements,
    suggestions: [...edits.suggestions, ...trims.suggestions.filter((s) => !keys.has(s.key))],
    rejected: [...edits.rejected, ...trims.rejected],
    advice: reply.advice,
    pages: input.pages,
  };
}

/** Asks for a new version of one rewrite/add/addProject suggestion, following the candidate's comment on it. */
export async function refineSuggestion(
  input: JobContext & { suggestion: Suggestion; comment: string },
): Promise<{ suggestion: Suggestion } | { error: string }> {
  const { suggestion: s, comment } = input;
  const notes = input.notes?.trim().slice(0, MAX_NOTES_CHARS) ?? "";
  const proposed =
    s.op === "addProject"
      ? { op: s.op, name: s.name, description: s.description, bullets: s.bullets }
      : s.op === "rewrite" || s.op === "add"
        ? { op: s.op, id: s.id, text: s.text }
        : undefined;
  if (!proposed) return { error: "Only rewrites and additions can be refined." };

  const user = [
    ...promptContext(input, notes),
    `YOUR EDIT (${s.target}):\n${s.before ? `Original: ${s.before}\n` : ""}Proposed: ${JSON.stringify(proposed)}`,
    `CANDIDATE'S COMMENT:\n${comment.trim().slice(0, 1000)}`,
  ].join("\n\n");
  const reply = await completeJson({
    system: REFINE_SYSTEM,
    user,
    schema: z.object({ operation: z.unknown() }),
    temperature: 0.3,
    writing: true,
  });

  // Hold the model to the same target, then run the usual safety checks.
  const op = { ...(reply.operation as object), op: s.op, ...(s.op === "addProject" ? {} : { id: s.id }) };
  const { suggestions, rejected } = validateOperations(input.cv, [op], notes);
  if (suggestions[0]) return { suggestion: suggestions[0] };
  return { error: rejected[0] ? `Blocked by safety checks: ${rejected[0].why}` : "The AI returned the same edit." };
}
