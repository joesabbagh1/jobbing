import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import { completeJson } from "@/lib/ai/deepseek";
import { type Cv, cvSchema, newId } from "./schema";

/** Text of the PDF, plus the URLs behind any hyperlinks (labels like "LinkedIn" hide them in plain text). */
export async function pdfToText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  const urls = await pdfLinks(pdf);
  return urls.length ? `${text.trim()}\n\nHyperlinks in the PDF:\n${urls.join("\n")}` : text.trim();
}

async function pdfLinks(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<string[]> {
  const urls = new Set<string>();
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    for (const a of await page.getAnnotations()) {
      if (a.subtype === "Link" && typeof a.url === "string" && !a.url.startsWith("mailto:")) urls.add(a.url);
    }
  }
  return [...urls];
}

// What we ask DeepSeek for: the CV shape without ids/hidden flags (we add those).
const s = z.string().nullish().transform((v) => v ?? "");
const parsedSchema = z.object({
  language: z.enum(["en", "fr"]).catch("en"),
  basics: z.object({
    name: s,
    headline: s,
    email: s,
    phone: s,
    location: s,
    links: z.array(z.object({ label: s, url: s })).nullish(),
  }),
  summary: s,
  experience: z
    .array(z.object({ company: s, url: s, role: s, location: s, start: s, end: s, bullets: z.array(z.string()).nullish() }))
    .nullish(),
  projects: z.array(z.object({ name: s, url: s, description: s, bullets: z.array(z.string()).nullish() })).nullish(),
  education: z.array(z.object({ school: s, degree: s, location: s, start: s, end: s, details: s })).nullish(),
  skills: z.array(z.object({ category: s, items: s })).nullish(),
  certifications: z.array(z.object({ name: s, detail: s })).nullish(),
  languages: z.array(z.object({ name: s, detail: s })).nullish(),
  interests: z.array(z.object({ name: s, detail: s })).nullish(),
});

const SYSTEM = `You convert the plain text of a CV (extracted from a PDF, so line breaks and columns may be scrambled) into JSON.

Rules:
- Copy wording VERBATIM from the CV. Do not rephrase, summarise, translate, correct or invent anything.
- If something isn't in the CV, use an empty string or empty array.
- basics.headline: only a job title printed on its own line under the name; if there is none, use "". Never derive it from the summary.
- experience[].url: the company's link from the "Hyperlinks in the PDF" list when the company name is a link (e.g. its website or LinkedIn page), else "".
- basics.links: use the "Hyperlinks in the PDF" list (if present) for URLs, matched to labels like LinkedIn, GitHub, Blog, Credly by domain. Project URLs go on the project.
- "language" is "fr" if the CV is written in French, otherwise "en".
- Each experience bullet is one achievement/responsibility line. If the CV uses paragraphs instead, split on sentences.
- Dates: keep the CV's format (e.g. "Jan 2023", "2021", "Present", "Aujourd'hui").
- skills: keep the CV's groups if it has them (category + comma-separated items); otherwise one group with an empty category.
- certifications/languages: "detail" holds issuer/date or proficiency level.
- interests: hobbies / "loisirs" / "centres d'intérêt"; "name" is the interest, "detail" any extra text.

JSON shape:
{"language": "en"|"fr",
 "basics": {"name","headline","email","phone","location","links":[{"label","url"}]},
 "summary": "",
 "experience": [{"company","url","role","location","start","end","bullets":[""]}],
 "projects": [{"name","url","description","bullets":[""]}],
 "education": [{"school","degree","location","start","end","details"}],
 "skills": [{"category","items"}],
 "certifications": [{"name","detail"}],
 "languages": [{"name","detail"}],
 "interests": [{"name","detail"}]}`;

/** Structures raw CV text with DeepSeek and assigns ids. */
export async function structureCv(text: string): Promise<Cv> {
  const p = await completeJson({ system: SYSTEM, user: text.slice(0, 30_000), schema: parsedSchema, temperature: 0 });
  const bullets = (list: string[] | null | undefined) =>
    (list ?? []).filter((t) => t.trim()).map((t) => ({ id: newId(), text: t.trim(), hidden: false }));

  return cvSchema.parse({
    language: p.language,
    basics: { ...p.basics, links: (p.basics.links ?? []).map((l) => ({ id: newId(), ...l })) },
    summary: p.summary,
    experience: (p.experience ?? []).map(({ bullets: b, ...e }) => ({ id: newId(), ...e, bullets: bullets(b) })),
    projects: (p.projects ?? []).map(({ bullets: b, ...e }) => ({ id: newId(), ...e, bullets: bullets(b) })),
    education: (p.education ?? []).map((e) => ({ id: newId(), ...e })),
    skills: (p.skills ?? []).map((e) => ({ id: newId(), ...e })),
    certifications: (p.certifications ?? []).map((e) => ({ id: newId(), ...e })),
    languages: (p.languages ?? []).map((e) => ({ id: newId(), ...e })),
    interests: (p.interests ?? []).map((e) => ({ id: newId(), ...e })),
  });
}
