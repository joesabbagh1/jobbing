import { z } from "zod";
import type { JobAnalysis } from "@/db/schema";
import { completeJson } from "./deepseek";

// Lenient on shape details the model sometimes gets slightly wrong (long lists, numeric strings).
const shortList = z.array(z.string()).catch([]).transform((a) => a.slice(0, 6));
const scoreSchema = z.object({
  score: z.coerce.number().transform((n) => Math.min(100, Math.max(0, n))),
  verdict: z.enum(["apply", "maybe", "skip"]),
  summary: z.string(),
  reasons: shortList,
  concerns: shortList,
});

export type JobScore = { score: number; analysis: JobAnalysis };

const SYSTEM = `You screen job postings for one candidate. Judge how well the posting fits the candidate's profile.

Scoring guide (0-100):
- 80-100: strong fit on role, seniority, location and stack; the candidate should apply.
- 60-79: reasonable fit with a gap or two.
- 30-59: weak fit (wrong seniority, partly wrong stack, location only borderline).
- 0-29: clearly not a fit (different job family, location impossible, excluded by the candidate's stated preferences).

Hard rules:
- If the location is impossible for the candidate (e.g. on-site in another country, or remote restricted to a region they are not in), score below 30.
- If the candidate explicitly says they don't want something the posting is (e.g. consulting, a seniority level), score below 40.
- Judge only from the text given. Do not invent requirements.

Reply in JSON: {"score": number, "verdict": "apply"|"maybe"|"skip", "summary": one sentence, "reasons": [short strings why it fits], "concerns": [short strings: gaps or red flags]}.
Write summary, reasons and concerns in English, even if the posting is in French.`;

export async function scoreJob(input: {
  profile: string;
  title: string;
  company: string;
  location?: string;
  description: string;
}): Promise<JobScore> {
  const user = [
    `CANDIDATE PROFILE:\n${input.profile}`,
    `JOB: ${input.title} at ${input.company}${input.location ? ` (${input.location})` : ""}`,
    `DESCRIPTION:\n${input.description.slice(0, 9000)}`,
  ].join("\n\n");

  const r = await completeJson({ system: SYSTEM, user, schema: scoreSchema });
  return {
    score: Math.round(r.score),
    analysis: { verdict: r.verdict, summary: r.summary, reasons: r.reasons, concerns: r.concerns },
  };
}
