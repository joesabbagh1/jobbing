import { parseHTML } from "linkedom";
import { fetchDescription, getLinkedIn } from "@/lib/jobs/description/fetch";
import type { SearchProfile } from "./profile";
import type { Posting } from "./sources";

// LinkedIn's logged-out job search (what a visitor without an account sees). It needs no login, so the
// user's account is never involved; the price is that it must stay slow (see getLinkedIn) and can be rate-limited.
const SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
const PAGE_SIZE = 10;
const PAGES_PER_QUERY = 5;
// The search runs every few hours, so a week of postings is plenty; anything already seen is skipped anyway.
const MAX_WINDOW_DAYS = 7;

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, " ").trim() ?? "";

/** Job cards from one page of LinkedIn's guest search results. */
export function parseLinkedInCards(html: string): Posting[] {
  const { document } = parseHTML(`<ul>${html}</ul>`);
  return [...document.querySelectorAll("[data-entity-urn^='urn:li:jobPosting:']")].flatMap((card) => {
    const id = card.getAttribute("data-entity-urn")?.split(":").pop();
    const title = clean(card.querySelector(".base-search-card__title")?.textContent);
    if (!id || !title) return [];
    const url = `https://www.linkedin.com/jobs/view/${id}`;
    return [
      {
        url,
        title,
        company: clean(card.querySelector(".base-search-card__subtitle")?.textContent),
        location: clean(card.querySelector(".job-search-card__location")?.textContent) || undefined,
        postedAt: card.querySelector("time")?.getAttribute("datetime") || undefined,
        source: "linkedin",
        loadDescription: async () => (await fetchDescription(url)).text,
      },
    ];
  });
}

/** Runs every LinkedIn query in the profile, one request at a time. Stops early if LinkedIn pushes back. */
export async function searchLinkedIn(
  settings: SearchProfile["linkedin"],
  maxAgeDays: number,
): Promise<{ postings: Posting[]; error?: string }> {
  const window = Math.min(maxAgeDays, MAX_WINDOW_DAYS) * 86_400;
  const byUrl = new Map<string, Posting>();
  for (const query of settings.queries) {
    for (let page = 0; page < PAGES_PER_QUERY; page++) {
      const params = new URLSearchParams({
        keywords: query,
        location: settings.location,
        f_TPR: `r${window}`,
        start: String(page * PAGE_SIZE),
      });
      let cards: Posting[];
      try {
        cards = parseLinkedInCards(await getLinkedIn(`${SEARCH_URL}?${params}`));
      } catch (err) {
        // Usually HTTP 429 (rate limit): keep what we have and try again next run.
        return { postings: [...byUrl.values()], error: `LinkedIn ("${query}"): ${(err as Error).message}` };
      }
      for (const c of cards) byUrl.set(c.url, c);
      if (cards.length < PAGE_SIZE) break;
    }
  }
  return { postings: [...byUrl.values()] };
}
