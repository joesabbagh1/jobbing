import { getDb } from "@/db";
import { isAirtableConfigured, syncAirtable } from "@/lib/airtable/sync";
import { geocodePending } from "@/lib/geo/geocode";
import { enrichPending } from "@/lib/jobs/description/enrich";
import { getLastSearch, runSearch } from "@/lib/search/run";

/** Puts new job locations on the map. Each distinct location text is looked up once, ever. */
async function geocode() {
  const r = await geocodePending(getDb());
  if (r.saved || r.errors.length) {
    console.log(`[map] placed ${r.saved}/${r.looked} new location(s)` + (r.errors.length ? `, ${r.errors[0]}` : ""));
  }
}

// Background jobs while the server runs. Guard against duplicate timers when the dev server reloads.
const g = globalThis as unknown as {
  __airtableTimer?: NodeJS.Timeout;
  __searchTimer?: NodeJS.Timeout;
  __airtableRunning?: boolean;
};

// 1. Pull new Growth-bot findings from Airtable and fetch missing descriptions.
if (!isAirtableConfigured()) {
  console.log("[airtable] not configured, auto-sync disabled");
} else {
  const minutes = Number(process.env.AIRTABLE_SYNC_MINUTES) || 5;
  const run = async () => {
    // Fetching descriptions can outlast the interval; skip a tick rather than run twice at once.
    if (g.__airtableRunning) return;
    g.__airtableRunning = true;
    try {
      const r = await syncAirtable(getDb());
      if (r.error) console.error(`[airtable] sync failed: ${r.error}`);
      else if (r.created) console.log(`[airtable] ${r.created} new job(s)`);

      const fetched = await enrichPending(getDb());
      if (fetched.length) {
        const ok = fetched.filter((f) => f.ok).length;
        console.log(`[descriptions] fetched ${ok}/${fetched.length}`);
      }

      await geocode();
    } finally {
      g.__airtableRunning = false;
    }
  };

  if (g.__airtableTimer) clearInterval(g.__airtableTimer);
  g.__airtableTimer = setInterval(run, minutes * 60_000);
  void run();
  console.log(`[airtable] auto-sync every ${minutes} min`);
}

// 2. Our own search over company boards. Checks every 10 minutes whether a run is due,
// so a laptop that slept through the schedule catches up when it wakes.
{
  const hours = Number(process.env.SEARCH_INTERVAL_HOURS) || 6;
  const due = () => {
    const last = getLastSearch(getDb());
    const lastAt = last?.finishedAt ?? last?.startedAt;
    // A run where every board failed (offline, asleep) is retried after 15 minutes.
    const wait = last?.allBoardsFailed ? 15 * 60_000 : hours * 3_600_000;
    return !lastAt || Date.now() - Date.parse(lastAt) > wait;
  };
  const tick = async () => {
    if (!due()) return;
    const r = await runSearch(getDb());
    console.log(
      `[search] ${r.postings} postings, ${r.matchedFilters} matched filters, ${r.added} added` +
        (r.errors.length ? `, ${r.errors.length} errors` : ""),
    );
    await geocode();
  };

  if (g.__searchTimer) clearInterval(g.__searchTimer);
  g.__searchTimer = setInterval(tick, 10 * 60_000);
  setTimeout(tick, 30_000);
  console.log(`[search] runs every ${hours} h`);
}
