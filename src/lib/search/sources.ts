import type { AtsType, Company } from "@/db/schema";
import { getJson, postJson } from "@/lib/jobs/description/fetch";
import {
  parseAshby,
  parseGreenhouse,
  parseLever,
  parseSmartRecruiters,
  parseWorkable,
} from "@/lib/jobs/description/parse";

/** One open position on a company board. */
export type Posting = {
  url: string;
  title: string;
  company: string;
  location?: string;
  remote?: boolean;
  postedAt?: string;
  /** Where it was found when that isn't the company's own board (e.g. "linkedin"). */
  source?: string;
  /** Present when the list endpoint already includes it; otherwise use loadDescription. */
  description?: string;
  loadDescription?: () => Promise<string>;
};

type Lister = (slug: string, company: string) => Promise<Posting[]>;

const iso = (d: number | string | undefined) => (d ? new Date(d).toISOString() : undefined);

const listLever: Lister = async (slug, company) => {
  type P = Parameters<typeof parseLever>[0] & {
    text: string;
    hostedUrl: string;
    createdAt?: number;
    workplaceType?: string;
  };
  const postings = await getJson<P[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  return postings.map((p) => ({
    url: p.hostedUrl,
    title: p.text,
    company,
    location: p.categories?.location,
    remote: p.workplaceType === "remote",
    postedAt: iso(p.createdAt),
    description: parseLever(p).text,
  }));
};

const listAshby: Lister = async (slug, company) => {
  type J = Parameters<typeof parseAshby>[0] & {
    title: string;
    jobUrl: string;
    isListed?: boolean;
    isRemote?: boolean;
    publishedAt?: string;
    secondaryLocations?: { location?: string }[];
  };
  const board = await getJson<{ jobs: J[] }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  return board.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      url: j.jobUrl,
      title: j.title,
      company,
      location: [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean).join("; "),
      remote: j.isRemote,
      postedAt: iso(j.publishedAt),
      description: parseAshby(j).text,
    }));
};

const listGreenhouse: Lister = async (slug, company) => {
  type J = { id: number; title: string; absolute_url: string; location?: { name?: string }; first_published?: string };
  const { jobs } = await getJson<{ jobs: J[] }>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  return jobs.map((j) => ({
    url: j.absolute_url,
    title: j.title,
    company,
    location: j.location?.name,
    postedAt: iso(j.first_published),
    loadDescription: async () =>
      parseGreenhouse(await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${j.id}`)).text,
  }));
};

const listSmartRecruiters: Lister = async (slug, company) => {
  type P = {
    id: string;
    name: string;
    releasedDate?: string;
    location?: { fullLocation?: string; city?: string; remote?: boolean };
  };
  const all: P[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await getJson<{ content: P[]; totalFound: number }>(
      `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100&offset=${offset}`,
    );
    all.push(...page.content);
    if (all.length >= page.totalFound || page.content.length === 0) break;
  }
  return all.map((p) => ({
    url: `https://jobs.smartrecruiters.com/${slug}/${p.id}`,
    title: p.name,
    company,
    location: p.location?.fullLocation ?? p.location?.city,
    remote: p.location?.remote,
    postedAt: iso(p.releasedDate),
    loadDescription: async () =>
      parseSmartRecruiters(await getJson(`https://api.smartrecruiters.com/v1/companies/${slug}/postings/${p.id}`))
        .text,
  }));
};

const listWorkable: Lister = async (slug, company) => {
  type J = {
    shortcode: string;
    title: string;
    remote?: boolean;
    published?: string;
    location?: { city?: string; country?: string };
  };
  const all: J[] = [];
  let token: string | undefined;
  do {
    const page = await postJson<{ results: J[]; nextPage?: string }>(
      `https://apply.workable.com/api/v3/accounts/${slug}/jobs`,
      { query: "", location: [], department: [], worktype: [], remote: [], ...(token && { token }) },
    );
    all.push(...page.results);
    token = page.nextPage;
  } while (token && all.length < 1000);
  return all.map((j) => ({
    url: `https://apply.workable.com/${slug}/j/${j.shortcode}`,
    title: j.title,
    company,
    location: [j.location?.city, j.location?.country].filter(Boolean).join(", ") || undefined,
    remote: j.remote,
    postedAt: iso(j.published),
    loadDescription: async () =>
      parseWorkable(await getJson(`https://apply.workable.com/api/v2/accounts/${slug}/jobs/${j.shortcode}`)).text,
  }));
};

const LISTERS: Record<AtsType, Lister> = {
  lever: listLever,
  ashby: listAshby,
  greenhouse: listGreenhouse,
  smartrecruiters: listSmartRecruiters,
  workable: listWorkable,
};

export function listPostings(company: Pick<Company, "ats" | "slug" | "name">): Promise<Posting[]> {
  return LISTERS[company.ats](company.slug, company.name);
}

export async function postingDescription(p: Posting): Promise<string> {
  return p.description ?? (p.loadDescription ? await p.loadDescription() : "");
}

/** Recognises a careers-page URL ("https://jobs.lever.co/acme") or "ats:slug" shorthand. */
export function parseBoardUrl(input: string): { ats: AtsType; slug: string } | null {
  const short = input.trim().match(/^(lever|ashby|greenhouse|smartrecruiters|workable):([\w.-]+)$/i);
  if (short) return { ats: short[1].toLowerCase() as AtsType, slug: short[2] };

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const [first] = url.pathname.split("/").filter(Boolean);
  const host = url.hostname.replace(/^www\./, "");
  if (host === "jobs.lever.co" && first) return { ats: "lever", slug: first };
  if (host === "jobs.ashbyhq.com" && first) return { ats: "ashby", slug: first };
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const slug = url.searchParams.get("for") ?? (first === "embed" ? undefined : first);
    if (slug) return { ats: "greenhouse", slug };
  }
  if (host === "jobs.smartrecruiters.com" && first) return { ats: "smartrecruiters", slug: first };
  if (host === "careers.smartrecruiters.com" && first) return { ats: "smartrecruiters", slug: first };
  if (host === "apply.workable.com" && first && first !== "j") return { ats: "workable", slug: first };
  return null;
}
