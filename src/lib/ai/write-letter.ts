import { z } from "zod";
import type { Cv } from "@/lib/cv/schema";
import { cvForPrompt } from "@/lib/cv/tailor";
import type { Letter } from "@/lib/letter/schema";
import { completeJson } from "./deepseek";

const replySchema = z.object({ subject: z.string(), body: z.string() });

const SYSTEM = `You write a cover letter for one candidate applying to one job.

Facts: use ONLY facts from the candidate's CV and profile. Never invent experience, employers, numbers, tools, certifications, achievements or motivations the candidate didn't state. Keep each fact's status and scope exactly as the CV states it: work the CV marks as ongoing ("en cours", "currently") stays ongoing, "contributed to" never becomes "led". About the company, only say what the job posting says; don't claim knowledge of its products, culture or news beyond the posting.

Content:
- Open with a specific reason this role fits: connect 1-2 concrete requirements of the posting to the candidate's experience. Never open with "I am writing to apply" / "Je me permets de".
- Middle: 2 short paragraphs, each backing one or two of the posting's key requirements with a concrete example from the CV (company, what was done, the result if the CV states one).
- If the candidate's availability or a clear gap matters for this posting, address it briefly and honestly. When you name a gap, do NOT soften it by claiming related skills, familiarity or "concepts" the CV doesn't state; you may only point to CV items that are genuinely adjacent.
- Close with a short, confident call to action.

Style: 250-350 words. Plain, direct, human. No clichés ("passionate", "dynamic", "team player", "motivé et rigoureux"), no buzzword lists, no em-dashes, no bullet points, no exclamation marks. First person.

Format:
- "subject": a short subject line naming the role, e.g. "Candidature au poste d'Ingénieur DevOps" or "Application for the DevOps Engineer position". No "Objet:"/"Subject:" prefix.
- "body": greeting, paragraphs and sign-off separated by blank lines ("\\n\\n"). Greeting: "Madame, Monsieur," in French or "Dear Hiring Team," in English (or the hiring manager's name if the posting gives it). Sign-off: "Cordialement," in French or "Kind regards," in English. Do NOT add the candidate's name, contact details, date or address: the template adds those.

Write in the LANGUAGE given. Reply in JSON: {"subject": "...", "body": "..."}.`;

export async function writeCoverLetter(input: {
  language: "en" | "fr";
  cv: Cv;
  profile: string;
  jobTitle: string;
  company: string;
  description: string;
  /** Optional extra direction from the user, e.g. "shorter" or "mention my homelab". */
  instructions?: string;
}): Promise<Letter> {
  const user = [
    `LANGUAGE: ${input.language === "fr" ? "French" : "English"}`,
    `CANDIDATE PROFILE (written by the candidate):\n${input.profile}`,
    `CANDIDATE CV:\n${cvForPrompt(input.cv)}`,
    `JOB: ${input.jobTitle} at ${input.company}`,
    `POSTING:\n${input.description.slice(0, 9000)}`,
    input.instructions?.trim() && `EXTRA INSTRUCTIONS FROM THE CANDIDATE (follow them unless they conflict with the fact rules):\n${input.instructions.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const reply = await completeJson({ system: SYSTEM, user, schema: replySchema, temperature: 0.6 });
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
