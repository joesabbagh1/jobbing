import { isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { jobs, type Place, places } from "@/db/schema";
import { completeJson } from "@/lib/ai/deepseek";

// Job locations are free text ("Paris, FR", "Hybrid Paris; Hybrid London", "Greater Lille Metropolitan Area").
// The AI turns each distinct text into coordinates once; the places table remembers the answer, so the same
// text never costs a second call.

/** Lowercase, single-spaced: "Paris,  FR " and "paris, fr" share one lookup. */
export function placeKey(location: string): string {
  return location.trim().replace(/\s+/g, " ").toLowerCase();
}

const BATCH = 40;

const replySchema = z.object({
  places: z.array(
    z.object({
      i: z.coerce.number().int(),
      kind: z.enum(["place", "broad"]).catch("broad"),
      label: z.string().catch(""),
      lat: z.coerce.number().min(-90).max(90).nullable().catch(null),
      lng: z.coerce.number().min(-180).max(180).nullable().catch(null),
    }),
  ),
});

const SYSTEM = `You geocode job-posting locations for a map of France. For each numbered location text, return the single best point.

- A city, town, address or business district: kind "place" with its coordinates (city centre is fine) and a short label, e.g. "Paris", "Sophia-Antipolis", "La Défense".
- A region, department or metro area ("Greater Lille Metropolitan Area", "Île-de-France", "Bouches-du-Rhône"): kind "place" at its main city, labelled with the area's usual short name.
- Several cities: pick the one in France (the candidate lives in Paris); if none is in France, pick the first.
- "Remote" or "Hybrid" with a city: that city.
- Only a country, only "Remote", or several countries with no city ("France", "Anywhere in France, Belgium, Spain"): kind "broad", lat and lng null, label like "France" or "Remote (France)".

Reply in JSON: {"places":[{"i": number, "kind": "place"|"broad", "label": string, "lat": number|null, "lng": number|null}]}. One entry per input, same i.`;

export type GeocodeResult = { looked: number; saved: number; errors: string[] };

/** Every cached place, keyed by placeKey. */
export function getPlaces(db: Db): Map<string, Place> {
  return new Map(db.select().from(places).all().map((p) => [p.query, p]));
}

const g = globalThis as unknown as { __geocoding?: Promise<GeocodeResult> };

/** Looks up job locations that aren't in the places table yet, a batch per AI call. Concurrent calls share one run. Never throws. */
export function geocodePending(db: Db): Promise<GeocodeResult> {
  g.__geocoding ??= run(db).finally(() => {
    g.__geocoding = undefined;
  });
  return g.__geocoding;
}

async function run(db: Db): Promise<GeocodeResult> {
  const known = getPlaces(db);
  const pending = new Map<string, string>();
  for (const { location } of db.select({ location: jobs.location }).from(jobs).where(isNotNull(jobs.location)).all()) {
    const key = placeKey(location!);
    if (key && !known.has(key) && !pending.has(key)) pending.set(key, location!.trim());
  }

  const result: GeocodeResult = { looked: pending.size, saved: 0, errors: [] };
  const entries = [...pending];
  for (let start = 0; start < entries.length; start += BATCH) {
    const batch = entries.slice(start, start + BATCH);
    try {
      const reply = await completeJson({
        system: SYSTEM,
        user: batch.map(([, text], i) => `${i}. ${text}`).join("\n"),
        schema: replySchema,
        temperature: 0,
      });
      for (const p of reply.places) {
        const entry = batch[p.i];
        if (!entry) continue;
        const pinned = p.kind === "place" && p.lat !== null && p.lng !== null;
        // A "place" without coordinates is left out, so it's asked again next time.
        if (p.kind === "place" && !pinned) continue;
        db.insert(places)
          .values({
            query: entry[0],
            kind: p.kind,
            label: p.label.trim() || entry[1],
            lat: pinned ? p.lat : null,
            lng: pinned ? p.lng : null,
          })
          .onConflictDoNothing()
          .run();
        result.saved++;
      }
    } catch (err) {
      result.errors.push(`Geocoding: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  return result;
}
