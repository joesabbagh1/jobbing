import { convert } from "html-to-text";
import { parseHTML } from "linkedom";

export type Extracted = { text: string; location?: string };

const TEXT_OPTIONS = {
  wordwrap: false as const,
  selectors: [
    { selector: "a", options: { ignoreHref: true } },
    { selector: "img", format: "skip" },
    { selector: "ul", options: { itemPrefix: "• " } },
    { selector: "h1", options: { uppercase: false } },
    { selector: "h2", options: { uppercase: false } },
    { selector: "h3", options: { uppercase: false } },
    { selector: "h4", options: { uppercase: false } },
  ],
};

/** HTML to readable plain text. Handles HTML that was entity-escaped once (Greenhouse, some JSON-LD). */
export function htmlToText(html: string): string {
  let text = convert(html, TEXT_OPTIONS);
  if (/<\/?(p|div|li|ul|br|span|strong|h\d)\b[^>]*>/i.test(text)) text = convert(text, TEXT_OPTIONS);
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function section(title: string | undefined, html: string | undefined): string {
  const body = html ? htmlToText(html) : "";
  if (!body) return "";
  return title ? `${title}\n${body}` : body;
}

const join = (parts: string[]) => parts.filter(Boolean).join("\n\n").trim();

type LeverPosting = {
  descriptionPlain?: string;
  lists?: { text?: string; content?: string }[];
  additionalPlain?: string;
  categories?: { location?: string };
};
export function parseLever(p: LeverPosting): Extracted {
  return {
    text: join([
      p.descriptionPlain ?? "",
      // List content is bare <li> items without a wrapping <ul>.
      ...(p.lists ?? []).map((l) => section(l.text, l.content && `<ul>${l.content}</ul>`)),
      p.additionalPlain ?? "",
    ]),
    location: p.categories?.location,
  };
}

type AshbyJob = { descriptionPlain?: string; descriptionHtml?: string; location?: string };
export function parseAshby(j: AshbyJob): Extracted {
  return {
    text: (j.descriptionPlain?.trim() || htmlToText(j.descriptionHtml ?? "")).trim(),
    location: j.location,
  };
}

type GreenhouseJob = { content?: string; location?: { name?: string } };
export function parseGreenhouse(j: GreenhouseJob): Extracted {
  return { text: htmlToText(j.content ?? ""), location: j.location?.name };
}

type WorkableJob = {
  description?: string;
  requirements?: string;
  benefits?: string;
  location?: { city?: string; country?: string };
};
export function parseWorkable(j: WorkableJob): Extracted {
  return {
    text: join([
      section(undefined, j.description),
      section("Requirements", j.requirements),
      section("Benefits", j.benefits),
    ]),
    location: [j.location?.city, j.location?.country].filter(Boolean).join(", ") || undefined,
  };
}

type SmartRecruitersPosting = {
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
  location?: { fullLocation?: string; city?: string };
};
export function parseSmartRecruiters(p: SmartRecruitersPosting): Extracted {
  const s = p.jobAd?.sections ?? {};
  const order = ["companyDescription", "jobDescription", "qualifications", "additionalInformation"];
  const keys = [...order.filter((k) => k in s), ...Object.keys(s).filter((k) => !order.includes(k))];
  return {
    text: join(keys.map((k) => section(s[k]?.title, s[k]?.text))),
    location: p.location?.fullLocation ?? p.location?.city,
  };
}

type WttjJob = {
  description?: string;
  profile?: string;
  recruitment_process?: string;
  office?: { city?: string; country?: string };
};
export function parseWelcomeToTheJungle(j: WttjJob): Extracted {
  return {
    text: join([
      section(undefined, j.description),
      section(undefined, j.profile),
      section("Recruitment process", j.recruitment_process),
    ]),
    location: [j.office?.city, j.office?.country].filter(Boolean).join(", ") || undefined,
  };
}

/** Finds a schema.org JobPosting in a page's JSON-LD blocks. */
export function parseJsonLd(html: string): Extracted | null {
  // Some sites (HelloWork) HTML-escape the "+" in the type attribute.
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld(?:\+|&#x2B;|&#43;)json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, raw] of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const posting = findJobPosting(data);
    if (posting && typeof posting.description === "string") {
      return { text: htmlToText(posting.description), location: jsonLdLocation(posting.jobLocation) };
    }
  }
  return null;
}

type JsonObject = Record<string, unknown>;

function findJobPosting(node: unknown): JsonObject | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  const obj = node as JsonObject;
  const type = obj["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return obj;
  return obj["@graph"] ? findJobPosting(obj["@graph"]) : null;
}

function jsonLdLocation(loc: unknown): string | undefined {
  const first = Array.isArray(loc) ? loc[0] : loc;
  const address = (first as JsonObject | undefined)?.address as JsonObject | string | undefined;
  if (!address) return undefined;
  if (typeof address === "string") return address;
  const country = address.addressCountry;
  const countryName =
    typeof country === "string" ? country : ((country as JsonObject | undefined)?.name as string | undefined);
  return [address.addressLocality, countryName].filter((v) => typeof v === "string" && v).join(", ") || undefined;
}

/**
 * Next.js streams parts of a page: a <template id="P:7"> placeholder, with the content later in
 * <div hidden id="S:7">. Browsers swap them with a script; this does the same for a parsed document.
 */
export function fillStreamedPlaceholders(document: ReturnType<typeof parseHTML>["document"]) {
  for (const placeholder of document.querySelectorAll("template[id^='P:']")) {
    const content = document.getElementById(`S:${placeholder.id.slice(2)}`);
    if (content) placeholder.replaceWith(...content.childNodes);
  }
}

/** A Jean-Michel.io job page: each section is an <h4> followed by its body (description, profile, company...). */
export function parseJeanMichelJob(html: string): Extracted {
  const { document } = parseHTML(html);
  return {
    text: join(
      [...document.querySelectorAll("h4")].map((h) =>
        section(h.textContent?.trim(), h.nextElementSibling?.innerHTML),
      ),
    ),
  };
}

/** LinkedIn's public (logged-out) job page: the description plus the "Seniority level / Employment type" facts. */
export function parseLinkedInJob(html: string): Extracted {
  const { document } = parseHTML(html);
  const body = document.querySelector(".show-more-less-html__markup")?.innerHTML ?? "";
  const criteria = [...document.querySelectorAll(".description__job-criteria-item")]
    .map((li) => {
      const label = li.querySelector(".description__job-criteria-subheader")?.textContent?.trim();
      const value = li.querySelector(".description__job-criteria-text")?.textContent?.trim();
      return label && value ? `${label}: ${value}` : "";
    })
    .filter(Boolean);
  const location = document.querySelector(".topcard__flavor--bullet")?.textContent?.trim() || undefined;
  return { text: join([htmlToText(body), criteria.join("\n")]), location };
}
