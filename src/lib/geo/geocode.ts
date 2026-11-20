import { isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { jobs, type Place, places } from "@/db/schema";

// Job locations are free text ("Paris, FR", "Hybrid Paris; Hybrid London", "Greater Lille Metropolitan Area").
// OpenStreetMap's Nominatim turns each distinct text into coordinates once; the places table remembers the answer,
// so the same text is never looked up twice.

/** Lowercase, single-spaced: "Paris,  FR " and "paris, fr" share one lookup. */
export function placeKey(location: string): string {
  return location.trim().replace(/\s+/g, " ").toLowerCase();
}

// Nominatim's usage policy: at most one request per second, and a User-Agent naming the application.
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "jobbing-local/1.0 (personal job-search app)";
const REQUEST_GAP_MS = 1100;
// Results that cover a whole country or more: shown as "broad" instead of a pin.
const BROAD_TYPES = new Set(["country", "continent"]);
// Results that are a place people live or work in. Anything else (a road, a building) is a bad match, so the next,
// shorter search text is tried instead.
const PLACE_TYPES = new Set([
  ...BROAD_TYPES,
  "state", "region", "province", "county", "municipality", "city", "town", "village", "hamlet", "suburb",
  "city_district", "district", "borough", "quarter", "neighbourhood", "locality", "isolated_dwelling", "island",
]);

const COUNTRY_CODES: Record<string, string> = { fr: "France", be: "Belgique", ch: "Suisse", lu: "Luxembourg", uk: "United Kingdom" };

/**
 * Search texts to try for a location, most precise first: the first of several places, without "Hybrid"/"Remote",
 * "Greater … Metropolitan Area", department numbers and empty parts. Empty when nothing is left (e.g. "Remote").
 */
export function searchTexts(location: string): string[] {
  const first = location.split(/;|\s\|\s/)[0];
  const parts = first
    .replace(/\b(hybrid|remote|télétravail|full remote)\b/gi, "")
    .replace(/\bgreater\b/gi, "")
    .replace(/\bmetropolitan area\b|\barea\b|\bregion\b/gi, "")
    .replace(/\(\d+\)/g, "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => COUNTRY_CODES[p.toLowerCase()] ?? p);
  if (parts.length === 0) return [];
  const texts = [parts.join(", ")];
  if (parts.length > 2) texts.push(`${parts[0]}, ${parts[parts.length - 1]}`);
  if (parts.length > 1) texts.push(parts[0]);
  return [...new Set(texts)];
}

type NominatimHit = { name: string; addresstype: string; lat: string; lon: string };

async function lookup(text: string): Promise<NominatimHit | undefined> {
  const url = `${NOMINATIM}?${new URLSearchParams({ q: text, format: "jsonv2", limit: "1", "accept-language": "fr" })}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Nominatim ${res.status} for "${text}"`);
  return ((await res.json()) as NominatimHit[])[0];
}

export type GeocodeResult = { looked: number; saved: number; errors: string[] };

/** Every cached place, keyed by placeKey. */
export function getPlaces(db: Db): Map<string, Place> {
  return new Map(db.select().from(places).all().map((p) => [p.query, p]));
}

const g = globalThis as unknown as { __geocoding?: Promise<GeocodeResult> };

/** Looks up job locations that aren't in the places table yet. Concurrent calls share one run. Never throws. */
export function geocodePending(db: Db): Promise<GeocodeResult> {
  g.__geocoding ??= run(db).finally(() => {
    g.__geocoding = undefined;
  });
  return g.__geocoding;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(db: Db): Promise<GeocodeResult> {
  const known = getPlaces(db);
  const pending = new Map<string, string>();
  for (const { location } of db.select({ location: jobs.location }).from(jobs).where(isNotNull(jobs.location)).all()) {
    const key = placeKey(location!);
    if (key && !known.has(key) && !pending.has(key)) pending.set(key, location!.trim());
  }

  const result: GeocodeResult = { looked: pending.size, saved: 0, errors: [] };
  let requests = 0;
  for (const [key, text] of pending) {
    let place: { kind: "place" | "broad"; label: string; lat: number | null; lng: number | null };
    try {
      let hit: NominatimHit | undefined;
      for (const q of searchTexts(text)) {
        if (requests++ > 0) await sleep(REQUEST_GAP_MS);
        const found = await lookup(q);
        if (found && PLACE_TYPES.has(found.addresstype)) {
          hit = found;
          break;
        }
      }
      if (!hit) {
        // Nothing found ("Remote", "Anywhere in Europe"): listed off the map, not looked up again.
        place = { kind: "broad", label: /remote|télétravail/i.test(text) ? "Remote" : text, lat: null, lng: null };
      } else if (BROAD_TYPES.has(hit.addresstype)) {
        place = { kind: "broad", label: hit.name, lat: null, lng: null };
      } else {
        place = { kind: "place", label: hit.name || text, lat: Number(hit.lat), lng: Number(hit.lon) };
      }
    } catch (err) {
      // Network or service errors leave the text out, so it's tried again next time.
      result.errors.push(`Geocoding: ${(err as Error).message.split("\n")[0]}`);
      continue;
    }
    db.insert(places)
      .values({ query: key, ...place })
      .onConflictDoNothing()
      .run();
    result.saved++;
  }
  return result;
}
