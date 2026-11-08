import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { linkedInJobId } from "../normalize-url";
import {
  type Extracted,
  htmlToText,
  parseAshby,
  parseGreenhouse,
  parseJeanMichelJob,
  parseJsonLd,
  parseLever,
  parseLinkedInJob,
  parseSmartRecruiters,
  parseWelcomeToTheJungle,
  parseWorkable,
} from "./parse";

export type FetchedDescription = Extracted & { source: string };

/** A fetch that can't succeed by retrying (unsupported site, job removed, ...). */
export class DescriptionError extends Error {}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5_000_000;
// Below this, what we extracted is probably a cookie banner or an error page.
const MIN_LENGTH = 200;

/** Fetches the full description for a job posting URL, preferring the ATS's public API. */
export async function fetchDescription(rawUrl: string): Promise<FetchedDescription> {
  const url = new URL(rawUrl);
  assertPublicHost(url);
  const host = url.hostname;
  const parts = url.pathname.split("/").filter(Boolean);

  let result: FetchedDescription | null = null;

  if (/(^|\.)linkedin\.com$/.test(host)) {
    // The logged-out job page; the full site needs a login.
    const id = linkedInJobId(url);
    if (!id) throw new DescriptionError("Unrecognised LinkedIn URL. Paste the description below.");
    result = {
      ...parseLinkedInJob(await getLinkedIn(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`)),
      source: "linkedin",
    };
  } else if (host === "consultant.jean-michel.io" && parts[0] === "annonces") {
    result = { ...parseJeanMichelJob(await getJeanMichel(url.toString())), source: "jean-michel" };
  } else if (host === "jobs.lever.co" && parts.length >= 2) {
    const [org, id] = parts;
    result = { ...parseLever(await getJson(`https://api.lever.co/v0/postings/${org}/${id}`)), source: "lever" };
  } else if (host === "jobs.ashbyhq.com" && parts.length >= 2) {
    const [org, id] = parts;
    const board = await getJson<{ jobs?: ({ id: string } & Parameters<typeof parseAshby>[0])[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${org}`,
    );
    const job = board.jobs?.find((j) => j.id === id);
    if (!job) throw new DescriptionError("Job no longer listed on the company's Ashby board.");
    result = { ...parseAshby(job), source: "ashby" };
  } else if (/(^|\.)greenhouse\.io$/.test(host) && parts[1] === "jobs" && /^\d+$/.test(parts[2] ?? "")) {
    const [org, , id] = parts;
    result = {
      ...parseGreenhouse(await getJson(`https://boards-api.greenhouse.io/v1/boards/${org}/jobs/${id}`)),
      source: "greenhouse",
    };
  } else if (host === "apply.workable.com") {
    result = await fetchWorkable(url);
  } else if (/(^|\.)welcometothejungle\.com$/.test(host) && parts.includes("jobs")) {
    // The site sits behind a bot check; its API doesn't. Path: /{lang}/companies/{org}/jobs/{slug}
    const org = parts[parts.indexOf("companies") + 1];
    const slug = parts[parts.indexOf("jobs") + 1];
    if (org && slug) {
      const { job } = await getJson<{ job: Parameters<typeof parseWelcomeToTheJungle>[0] }>(
        `https://api.welcometothejungle.com/api/v1/organizations/${org}/jobs/${slug}`,
      );
      result = { ...parseWelcomeToTheJungle(job), source: "welcometothejungle" };
    }
  } else if (host === "jobs.smartrecruiters.com" && parts.length >= 2) {
    const [company, slug] = parts;
    const id = slug.match(/^\d+/)?.[0];
    if (id) {
      result = {
        ...parseSmartRecruiters(await getJson(`https://api.smartrecruiters.com/v1/companies/${company}/postings/${id}`)),
        source: "smartrecruiters",
      };
    }
  }

  // Everything else: the page's schema.org JobPosting, then a readability extraction.
  if (!result) {
    const html = await getText(url.toString());
    const jsonLd = parseJsonLd(html);
    // Job boards like HelloWork keep expired postings online with a notice instead of a 404.
    if (!jsonLd && /offre d.emploi[^<]{0,80}n.est plus disponible|this job (?:is )?no longer available/i.test(html)) {
      throw new DescriptionError("The posting no longer exists (it may have been filled).");
    }
    result = jsonLd && jsonLd.text.length >= MIN_LENGTH ? { ...jsonLd, source: "jsonld" } : extractMainText(html);
  }

  if (result.text.length < MIN_LENGTH) {
    throw new DescriptionError("Couldn't find a job description on the page. Paste it below.");
  }
  return result;
}

async function fetchWorkable(url: URL): Promise<FetchedDescription> {
  // URLs look like /{account}/j/{shortcode}, or /j/{shortcode} which redirects to the former.
  let parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "j") {
    const res = await request(url.toString());
    parts = new URL(res.url).pathname.split("/").filter(Boolean);
    await res.body?.cancel();
  }
  const [account, j, shortcode] = parts;
  if (j !== "j" || !shortcode) throw new DescriptionError("Unrecognised Workable URL.");
  return {
    ...parseWorkable(await getJson(`https://apply.workable.com/api/v2/accounts/${account}/jobs/${shortcode}`)),
    source: "workable",
  };
}

function extractMainText(html: string): FetchedDescription {
  const { document } = parseHTML(html);
  const article = new Readability(document as unknown as Document).parse();
  return { text: htmlToText(article?.content ?? ""), source: "page" };
}

async function request(
  url: string,
  accept = "text/html,application/xhtml+xml",
  init: { method?: string; body?: string } = {},
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "user-agent": USER_AGENT,
      accept,
      "accept-language": "en,fr;q=0.8",
      ...(init.body && { "content-type": "application/json" }),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  assertPublicHost(new URL(res.url));
  if (res.status === 404 || res.status === 410) {
    throw new DescriptionError("The posting no longer exists (it may have been filled).");
  }
  // 202 with an empty body is how bot-protection challenges usually answer.
  if (!res.ok || res.status === 202) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return res;
}

async function getText(url: string): Promise<string> {
  const res = await request(url);
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new DescriptionError("Page too large to process.");
  return body;
}

// LinkedIn rate-limits bursts from one IP, and Jean-Michel.io is a small site we shouldn't hammer: every request
// to either, from the search or description fetches, waits its turn, and a 429 is retried once after a pause.
const SLOW_GAP_MS = 2_000;
const SLOW_RETRY_MS = 20_000;
const slowQueues = globalThis as unknown as { __slowQueues?: Map<string, Promise<void>> };

/** GETs a page, at most one request every SLOW_GAP_MS per site across the whole app. */
async function getSlowly(site: string, url: string): Promise<string> {
  const queues = (slowQueues.__slowQueues ??= new Map<string, Promise<void>>());
  const turn = queues.get(site) ?? Promise.resolve();
  let release!: () => void;
  queues.set(site, new Promise((r) => (release = r)));
  await turn;
  try {
    return await getText(url);
  } catch (err) {
    if (!/HTTP 429/.test((err as Error).message)) throw err;
    await new Promise((r) => setTimeout(r, SLOW_RETRY_MS));
    return await getText(url);
  } finally {
    setTimeout(release, SLOW_GAP_MS);
  }
}

export const getLinkedIn = (url: string) => getSlowly("linkedin", url);
export const getJeanMichel = (url: string) => getSlowly("jean-michel", url);

export async function getJson<T = never>(url: string): Promise<T> {
  const res = await request(url, "application/json");
  return (await res.json()) as T;
}

export async function postJson<T = never>(url: string, body: unknown): Promise<T> {
  const res = await request(url, "application/json", { method: "POST", body: JSON.stringify(body) });
  return (await res.json()) as T;
}

/** URLs come from Airtable, so refuse anything that points at this machine or the LAN. */
function assertPublicHost(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new DescriptionError("Not a web URL.");
  const h = url.hostname.replace(/^\[|\]$/g, "");
  const privateHost =
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    !h.includes(".") ||
    /^(127|10|0)\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.includes(":"); // IPv6 literal
  if (privateHost) throw new DescriptionError("Refusing to fetch a private address.");
}
