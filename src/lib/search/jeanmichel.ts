import { parseHTML } from "linkedom";
import { fetchDescription, getJeanMichel } from "@/lib/jobs/description/fetch";
import { fillStreamedPlaceholders } from "@/lib/jobs/description/parse";
import type { SearchProfile } from "./profile";
import type { Posting } from "./sources";

// Jean-Michel.io's public listings, for IT consultants. No login involved; requests stay slow (see getJeanMichel).
const BASE_URL = "https://consultant.jean-michel.io";
const PAGE_SIZE = 14;
// The site's search is loose and reasonably recent-first; anything already seen is skipped anyway.
const PAGES_PER_QUERY = 3;
const ILE_DE_FRANCE = new Set(["75", "77", "78", "91", "92", "93", "94", "95"]);
const DAYS_PER_UNIT: Record<string, number> = { jour: 1, semaine: 7, mois: 30, an: 365 };

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, " ").trim() ?? "";

/** "il y a 9 heures" as a date. The site only gives relative ages, so this is approximate. */
export function parseRelativeAge(text: string, now = Date.now()): string | undefined {
  const match = text.match(/il y a (\d+|une?) (minute|heure|jour|semaine|mois|an)/i);
  if (!match) return undefined;
  const count = Number(match[1]) || 1;
  const unit = match[2].toLowerCase();
  const hours = unit === "minute" ? 1 / 60 : unit === "heure" ? 1 : DAYS_PER_UNIT[unit] * 24;
  return new Date(now - count * hours * 3_600_000).toISOString();
}

/** "saint-germain-en-laye (78)" as "Saint-Germain-En-Laye (78), Île-de-France, France", so location filters match. */
function formatLocation(tag: string, department: string): string {
  const place = tag.replace(/(^|[\s-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase());
  return [place, ILE_DE_FRANCE.has(department) && "Île-de-France", "France"].filter(Boolean).join(", ");
}

/** Every job card on a results page. `cdi` is false for freelance-only listings. */
export function parseJeanMichelCards(html: string, now = Date.now()): (Posting & { cdi: boolean })[] {
  const { document } = parseHTML(html);
  fillStreamedPlaceholders(document);
  return [...document.querySelectorAll("a[href^='/annonces/']")].flatMap((card) => {
    const path = card.getAttribute("href") ?? "";
    const title = clean(card.querySelector("h3")?.textContent);
    if (!/^\/annonces\/\d+$/.test(path) || !title) return [];
    const tags = [...card.querySelectorAll("[data-slot='tag']")].map((t) => clean(t.textContent));
    const [company = "", age = ""] = [...card.querySelectorAll("header [data-slot='tag']")].map((t) =>
      clean(t.textContent),
    );
    const locationTag = tags.find((t) => /\((\d{2,3}|2[AB])\)$/.test(t));
    const department = locationTag?.match(/\((\w+)\)$/)?.[1];
    const url = `${BASE_URL}${path}`;
    return [
      {
        url,
        title,
        company,
        location: locationTag && department ? formatLocation(locationTag, department) : undefined,
        remote: tags.includes("100% remote"),
        postedAt: parseRelativeAge(age, now),
        source: "jean-michel",
        cdi: tags.includes("CDI"),
        loadDescription: async () => (await fetchDescription(url)).text,
      },
    ];
  });
}

/** Runs every query in the profile, one request at a time, keeping permanent (CDI) roles only. */
export async function searchJeanMichel(
  settings: SearchProfile["jeanMichel"],
): Promise<{ postings: Posting[]; error?: string }> {
  const byUrl = new Map<string, Posting>();
  let cardsSeen = 0;
  for (const query of settings.queries) {
    for (let page = 1; page <= PAGES_PER_QUERY; page++) {
      const params = new URLSearchParams({ query, page: String(page) });
      let cards: ReturnType<typeof parseJeanMichelCards>;
      try {
        cards = parseJeanMichelCards(await getJeanMichel(`${BASE_URL}/annonces?${params}`));
      } catch (err) {
        return { postings: [...byUrl.values()], error: `Jean-Michel ("${query}"): ${(err as Error).message}` };
      }
      cardsSeen += cards.length;
      for (const { cdi, ...posting } of cards) if (cdi) byUrl.set(posting.url, posting);
      if (cards.length < PAGE_SIZE) break;
    }
  }
  // Every query coming back empty means the page changed shape, not that the site has no jobs.
  const error = cardsSeen === 0 && settings.queries.length > 0 ? "Jean-Michel: no job cards found on the page" : undefined;
  return { postings: [...byUrl.values()], error };
}
