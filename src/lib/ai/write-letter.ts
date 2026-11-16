import { z } from "zod";
import type { Cv } from "@/lib/cv/schema";
import { cvForPrompt, MAX_NOTES_CHARS } from "@/lib/cv/tailor";
import type { Letter } from "@/lib/letter/schema";
import { completeJson } from "./deepseek";

// "plan" comes first so the model picks its evidence before it writes; it isn't kept.
const replySchema = z.object({ plan: z.unknown().optional(), subject: z.string(), body: z.string() });

const SYSTEM = `You write a cover letter for one candidate applying to one job. You get the posting, the candidate's CV, a short profile they wrote and, usually, their EXPERIENCE NOTES: their own detailed record of each job and project.

The recruiter already has the CV. The letter must add what the CV cannot: why this candidate for this job, told through one or two concrete stories.

First write "plan": the 2-3 requirements that matter most in this posting, most important first, each as {"requirement": the posting's words, "evidence": the single best proof in the CV or notes, with the job it comes from}. Choose evidence in this order of preference: paid work before personal or school projects; work on the same technology or platform the posting names before similar work elsewhere (for a posting that asks for AWS, tell the AWS work, not similar work on another cloud); the largest scale and the most recent first. Use two different jobs when the candidate has them. The letter then tells the plan's evidence, in that order.

Structure:
1. Opening (2-3 sentences): what the role or team does, in the posting's terms, and the candidate's closest matching experience, named concretely (which job, what was done), not a general claim of years of experience. Never open with "I am writing to apply" / "Je me permets de" / "Votre annonce a retenu mon attention".
2. Two paragraphs, one story each: the situation, what the candidate did, and the outcome, using details from the notes. Do not paste CV bullets or parenthesised tool lists; name at most 3 tools per paragraph. End each paragraph on the fact, not on a sentence explaining what it "shows" or "demonstrates".
3. One sentence on when the candidate is available, with the date the CV or profile gives. State it plainly: no apology, no "as stated in my CV".
4. A one-sentence close proposing a conversation.

Facts:
- Use ONLY facts from the CV, the notes and the profile. Never invent experience, employers, numbers, tools, certifications, achievements or motivations the candidate didn't state, and never claim a tool, platform or domain just because the posting names it.
- Keep each fact's status and scope exactly as stated: work marked as ongoing ("en cours", "currently") stays ongoing, "contributed to" never becomes "led". Describe the candidate with the roles on their CV: never give them a title they haven't held (consultant, senior, lead...).
- About the company, only say what the job posting says; don't claim knowledge of its products, culture or news beyond the posting.
- Do not volunteer weaknesses: don't list tools the candidate lacks, don't argue about years of experience, don't enumerate job dates. Mention a gap only if the posting marks it as mandatory, in one clause, next to the nearest real experience.
- Leave out the candidate's search preferences (where they would work, remote, kinds of companies) unless the posting asks about them.

Style: 250-320 words. Plain, direct, human. First person. No clichés ("passionate", "dynamic", "team player", "motivé et rigoureux", "résonne avec", "ravi de"), no buzzword lists, no em-dashes, no bullet points, no exclamation marks.

Format:
- "subject": a short subject line naming the role, e.g. "Candidature au poste d'Ingénieur DevOps" or "Application for the DevOps Engineer position". No "Objet:"/"Subject:" prefix.
- "body": greeting, paragraphs and sign-off separated by blank lines ("\\n\\n"). Greeting: "Madame, Monsieur," in French or "Dear Hiring Team," in English (or the hiring manager's name if the posting gives it). Sign-off: "Cordialement," in French or "Kind regards," in English. Do NOT add the candidate's name, contact details, date or address: the template adds those.

Write in the LANGUAGE given. Reply in JSON: {"plan": [...], "subject": "...", "body": "..."}.`;

// The model often stops well short of the length it was asked for.
const MIN_WORDS = 250;
const wordCount = (text: string) => text.trim().split(/\s+/).length;

export async function writeCoverLetter(input: {
  language: "en" | "fr";
  cv: Cv;
  profile: string;
  /** The candidate's free-form notes on everything they worked on. */
  notes?: string;
  jobTitle: string;
  company: string;
  description: string;
  /** Optional extra direction from the user, e.g. "shorter" or "mention my homelab". */
  instructions?: string;
}): Promise<Letter> {
  const notes = input.notes?.trim().slice(0, MAX_NOTES_CHARS) ?? "";
  const instructions = input.instructions?.trim();
  const user = [
    `LANGUAGE: ${input.language === "fr" ? "French" : "English"}`,
    `JOB: ${input.jobTitle} at ${input.company}`,
    `POSTING:\n${input.description.slice(0, 9000)}`,
    `CANDIDATE PROFILE (written by the candidate):\n${input.profile}`,
    `CANDIDATE CV:\n${cvForPrompt(input.cv)}`,
    notes && `EXPERIENCE NOTES:\n${notes}`,
    instructions && `EXTRA INSTRUCTIONS FROM THE CANDIDATE (follow them unless they conflict with the fact rules):\n${instructions}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const ask = (prompt: string) => completeJson({ system: SYSTEM, user: prompt, schema: replySchema, temperature: 0.6, writing: true });
  let reply = await ask(user);
  const words = wordCount(reply.body);
  // One retry on a short draft, unless the candidate asked for a short letter.
  if (words < MIN_WORDS && !instructions) {
    const longer = await ask(
      `${user}\n\nYOUR PREVIOUS DRAFT (${words} words, too short):\n${reply.body}\n\nWrite it again in 250 to 320 words: keep what is there and add concrete detail to the two story paragraphs.`,
    ).catch(() => undefined);
    if (longer && wordCount(longer.body) > words) reply = longer;
  }
  return {
    language: input.language,
    subject: reply.subject.replace(/^(objet|subject)\s*:\s*/i, "").trim(),
    body: fixSignOff(reply.body.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), input.language),
  };
}

const SIGN_OFFS = /^(cordialement|bien cordialement|salutations distinguées|kind regards|best regards|regards|sincerely|yours sincerely|yours faithfully)[,.]?$/i;

/** The model sometimes signs off in the wrong language; make the last line match the letter. */
export function fixSignOff(body: string, language: "en" | "fr"): string {
  const signOff = language === "fr" ? "Cordialement," : "Kind regards,";
  const paragraphs = body.split(/\n\s*\n/);
  const last = paragraphs.at(-1)?.trim() ?? "";
  if (SIGN_OFFS.test(last)) paragraphs[paragraphs.length - 1] = signOff;
  else paragraphs.push(signOff);
  return paragraphs.join("\n\n");
}
