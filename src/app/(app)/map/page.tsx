import { getDb } from "@/db";
import { jobs } from "@/db/schema";
import { getPlaces, placeKey } from "@/lib/geo/geocode";
import { JobsMap, type MapJob, type MapPin } from "./jobs-map";

export const dynamic = "force-dynamic";

export default function MapPage() {
  const db = getDb();
  const known = getPlaces(db);
  const rows = db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: jobs.company,
      location: jobs.location,
      status: jobs.status,
      score: jobs.matchScore,
    })
    .from(jobs)
    .all();

  // One pin per place name: "Paris, FR", "Hybrid Paris" and a street address in Paris share the Paris pin.
  const pins = new Map<string, MapPin>();
  const unplaced: MapJob[] = [];
  for (const { location, ...job } of rows) {
    const place = location ? known.get(placeKey(location)) : undefined;
    const item: MapJob = { ...job, location: location ?? "", score: job.score === null ? null : Math.round(job.score) };
    if (place?.lat == null || place.lng == null) {
      unplaced.push(item);
      continue;
    }
    const key = place.label.toLowerCase();
    const pin = pins.get(key) ?? { key, label: place.label, lat: place.lat, lng: place.lng, jobs: [] };
    pin.jobs.push(item);
    pins.set(key, pin);
  }

  // Pins on the exact same spot ("Île-de-France" is placed at Paris) would never separate when zooming in:
  // fold each into the bigger one there.
  const bySpot = new Map<string, MapPin>();
  for (const pin of [...pins.values()].sort((a, b) => b.jobs.length - a.jobs.length)) {
    const spot = `${pin.lat.toFixed(3)},${pin.lng.toFixed(3)}`;
    const existing = bySpot.get(spot);
    if (existing) existing.jobs.push(...pin.jobs);
    else bySpot.set(spot, pin);
  }

  return <JobsMap pins={[...bySpot.values()]} unplaced={unplaced} />;
}
