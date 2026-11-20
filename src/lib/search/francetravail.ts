import type { Posting } from "./sources";

// France Travail's public job offers API (francetravail.io, "Offres d'emploi v2"): the national job database, which
// also carries offers that partner job boards and company career sites pass on. Free, but it needs an application
// registered on francetravail.io; its client ID and secret go in .env.local. Without them this source is skipped.
const TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";
const SCOPE = "api_offresdemploiv2 o2dsoffre";
const PAGE_SIZE = 150; // the API's maximum per request
const MAX_PER_QUERY = 450;

export const FRANCE_TRAVAIL_QUERIES = [
  "devops",
  "devsecops",
  "sre",
  "site reliability",
  "kubernetes",
  "ingénieur cloud",
  "cloud engineer",
  "platform engineer",
  "sécurité cloud",
];

type Offer = {
  id: string;
  intitule: string;
  description?: string;
  dateCreation?: string;
  dateActualisation?: string;
  typeContrat?: string;
  lieuTravail?: { libelle?: string };
  entreprise?: { nom?: string; description?: string };
  origineOffre?: { urlOrigine?: string; partenaires?: { nom?: string; url?: string }[] };
};

export function franceTravailConfigured(): boolean {
  return Boolean(process.env.FRANCE_TRAVAIL_CLIENT_ID && process.env.FRANCE_TRAVAIL_CLIENT_SECRET);
}

async function accessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.FRANCE_TRAVAIL_CLIENT_ID ?? "",
      client_secret: process.env.FRANCE_TRAVAIL_CLIENT_SECRET ?? "",
      scope: SCOPE,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`France Travail login failed (${res.status}): check the client ID and secret.`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** "69 - LYON 03" → "Lyon 03 (69)". */
export function franceTravailLocation(libelle: string | undefined): string | undefined {
  const m = libelle?.match(/^(\d{2,3}|2[AB])\s*-\s*(.+)$/);
  if (!m) return libelle || undefined;
  const city = m[2].toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
  return `${city} (${m[1]})`;
}

export function offerToPosting(o: Offer): Posting {
  return {
    url: `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}`,
    title: o.intitule,
    company: o.entreprise?.nom?.trim() || "Entreprise non communiquée",
    location: franceTravailLocation(o.lieuTravail?.libelle),
    postedAt: o.dateCreation,
    source: "francetravail",
    description: [o.description, o.entreprise?.description].filter(Boolean).join("\n\n"),
  };
}

/** The API only accepts these ages, in days. */
const publishedSince = (days: number) => [1, 3, 7, 14, 31].find((d) => d >= days) ?? 31;

/** Runs every query for permanent contracts (CDI) published in the last `maxAgeDays`. */
export async function searchFranceTravail(
  maxAgeDays: number,
  queries = FRANCE_TRAVAIL_QUERIES,
): Promise<{ postings: Posting[]; error?: string }> {
  if (!franceTravailConfigured()) return { postings: [] };
  const byId = new Map<string, Posting>();
  try {
    const token = await accessToken();
    for (const query of queries) {
      for (let start = 0; start < MAX_PER_QUERY; start += PAGE_SIZE) {
        const params = new URLSearchParams({
          motsCles: query,
          typeContrat: "CDI",
          publieeDepuis: String(publishedSince(Math.min(maxAgeDays, 31))),
          range: `${start}-${start + PAGE_SIZE - 1}`,
        });
        const res = await fetch(`${SEARCH_URL}?${params}`, {
          headers: { authorization: `Bearer ${token}`, accept: "application/json" },
          signal: AbortSignal.timeout(20_000),
        });
        if (res.status === 204) break; // no results
        if (!res.ok) throw new Error(`France Travail search failed for "${query}" (${res.status}).`);
        const { resultats = [] } = (await res.json()) as { resultats?: Offer[] };
        for (const o of resultats) if (!byId.has(o.id)) byId.set(o.id, offerToPosting(o));
        if (resultats.length < PAGE_SIZE) break;
        await new Promise((r) => setTimeout(r, 250)); // the API allows a few calls per second
      }
    }
    return { postings: [...byId.values()] };
  } catch (err) {
    return { postings: [...byId.values()], error: err instanceof Error ? err.message : String(err) };
  }
}
