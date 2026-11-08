import { z } from "zod";
import type { Db } from "@/db";
import { getSetting, setSetting } from "@/lib/settings";

const keywords = z.array(z.string().trim().toLowerCase().min(1));

export const searchProfileSchema = z.object({
  /** A job title must contain at least one of these. */
  titleKeywords: keywords,
  /** A job title containing any of these is dropped. */
  excludeTitleKeywords: keywords,
  /** The job location must contain at least one of these (empty = any location). */
  locations: keywords,
  /** Skip postings older than this many days (when the board gives a date). */
  maxAgeDays: z.number().int().min(1).max(365),
  /** Minimum AI score (0–100) for a job to be added. */
  minScore: z.number().int().min(0).max(100),
  /** Who you are and what you want, in your own words. This is what the AI scores against. */
  about: z.string().trim().min(1),
  /** LinkedIn's public job search, run with each query (results still go through the filters above). */
  linkedin: z
    .object({
      enabled: z.boolean(),
      queries: keywords,
      /** LinkedIn's location box, e.g. "France" or "Paris, Île-de-France, France". */
      location: z.string().trim().min(1),
    })
    .default({
      enabled: true,
      queries: ["devops", "sre", "cloud engineer", "platform engineer", "kubernetes", "devsecops"],
      location: "France",
    }),
  /** Jean-Michel.io's public listings, run with each query (permanent roles only, then the filters above). */
  jeanMichel: z
    .object({
      enabled: z.boolean(),
      queries: keywords,
    })
    .default({
      enabled: true,
      queries: ["devops", "sre", "cloud", "platform engineer", "kubernetes", "devsecops"],
    }),
});
export type SearchProfile = z.infer<typeof searchProfileSchema>;

// Starting point inferred from the Growth bot's findings. Edit it on the Search page.
export const DEFAULT_PROFILE: SearchProfile = {
  titleKeywords: [
    "devops",
    "devsecops",
    "sre",
    "site reliability",
    "platform",
    "cloud",
    "infrastructure",
    "infra",
    "kubernetes",
    "production engineer",
  ],
  excludeTitleKeywords: [
    "intern",
    "internship",
    "stage",
    "stagiaire",
    "alternance",
    "alternant",
    "apprenti",
    "apprentice",
    "director",
    "head of",
    "vp",
    "sales",
    "account executive",
    "solutions engineer",
    "solution engineer",
    "customer",
    "product manager",
    "acheteur",
    "buyer",
    "recruiter",
  ],
  locations: ["paris", "île-de-france", "ile-de-france", "france", "remote", "anywhere", "europe", "emea"],
  maxAgeDays: 45,
  minScore: 60,
  about: [
    "EDIT ME: describe yourself so the AI can judge fit.",
    "Example: DevOps / Cloud / Platform engineer with ~3 years of experience.",
    "Strong with AWS, Kubernetes, Terraform, CI/CD, Python. Based in Paris.",
    "Looking for a permanent (CDI) role in Paris or hybrid in Île-de-France, or fully remote within France.",
    "Interested in product startups and scale-ups. Not interested in consulting/ESN body-shopping roles.",
  ].join("\n"),
  linkedin: searchProfileSchema.shape.linkedin.parse(undefined),
  jeanMichel: searchProfileSchema.shape.jeanMichel.parse(undefined),
};

const KEY = "searchProfile";

export function getSearchProfile(db: Db): SearchProfile {
  const stored = searchProfileSchema.safeParse(getSetting(db, KEY));
  return stored.success ? stored.data : DEFAULT_PROFILE;
}

export function saveSearchProfile(db: Db, profile: SearchProfile) {
  setSetting(db, KEY, searchProfileSchema.parse(profile));
}
