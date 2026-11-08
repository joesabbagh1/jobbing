import { z } from "zod";

// Every item that can be reordered, hidden or reworded has a stable id, so AI suggestions
// can reference existing content ("rewrite bullet b3") instead of inventing new content.
const id = z.string().min(1);
const text = z.string().default("");

export const bulletSchema = z.object({ id, text, hidden: z.boolean().default(false) });

export const experienceSchema = z.object({
  id,
  company: text,
  /** Company website / LinkedIn page; the company name becomes a link. */
  url: text,
  role: text,
  location: text,
  start: text,
  end: text,
  bullets: z.array(bulletSchema).default([]),
  hidden: z.boolean().default(false),
});

export const educationSchema = z.object({
  id,
  school: text,
  degree: text,
  location: text,
  start: text,
  end: text,
  details: text,
  hidden: z.boolean().default(false),
});

export const projectSchema = z.object({
  id,
  name: text,
  url: text,
  description: text,
  bullets: z.array(bulletSchema).default([]),
  hidden: z.boolean().default(false),
});

export const skillGroupSchema = z.object({
  id,
  category: text,
  /** Comma-separated, e.g. "AWS, GCP, Terraform". */
  items: text,
  hidden: z.boolean().default(false),
});

export const simpleItemSchema = z.object({
  id,
  name: text,
  detail: text,
  hidden: z.boolean().default(false),
});

export const cvSchema = z.object({
  /** Language for section headings. */
  language: z.enum(["en", "fr"]).default("en"),
  paper: z.enum(["a4", "letter"]).default("a4"),
  basics: z.object({
    name: text,
    headline: text,
    email: text,
    phone: text,
    location: text,
    links: z.array(z.object({ id, label: text, url: text })).default([]),
  }),
  summary: text,
  experience: z.array(experienceSchema).default([]),
  projects: z.array(projectSchema).default([]),
  education: z.array(educationSchema).default([]),
  skills: z.array(skillGroupSchema).default([]),
  certifications: z.array(simpleItemSchema).default([]),
  languages: z.array(simpleItemSchema).default([]),
  interests: z.array(simpleItemSchema).default([]),
});

export type Cv = z.infer<typeof cvSchema>;
export type CvBullet = z.infer<typeof bulletSchema>;
export type CvExperience = z.infer<typeof experienceSchema>;
export type CvEducation = z.infer<typeof educationSchema>;
export type CvProject = z.infer<typeof projectSchema>;
export type CvSkillGroup = z.infer<typeof skillGroupSchema>;
export type CvSimpleItem = z.infer<typeof simpleItemSchema>;

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const EMPTY_CV: Cv = cvSchema.parse({ basics: {} });

/** Page geometry in millimetres. The CV uses 0.5in (12.7mm) margins on every side. */
export const PAPER = {
  a4: { width: 210, height: 297, margin: 12.7 },
  letter: { width: 215.9, height: 279.4, margin: 12.7 },
} as const;

export const HEADINGS = {
  en: {
    summary: "Summary",
    experience: "Experience",
    projects: "Projects",
    education: "Education",
    skills: "Skills",
    certifications: "Certifications",
    languages: "Languages",
    interests: "Interests",
  },
  fr: {
    summary: "Profil",
    experience: "Expériences",
    projects: "Projets",
    education: "Formations",
    skills: "Compétences",
    certifications: "Certifications",
    languages: "Langues",
    interests: "Loisirs",
  },
} as const;
