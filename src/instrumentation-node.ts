import { getDb } from "@/db";
import { isAiConfigured } from "@/lib/ai/deepseek";
import { isAirtableConfigured, syncAirtable } from "@/lib/airtable/sync";
import { geocodePending } from "@/lib/geo/geocode";
import { enrichPending } from "@/lib/jobs/description/enrich";
import { getSearchProfile } from "@/lib/search/profile";
import { getLastSearch, runSearch, scoreUnscoredJobs } from "@/lib/search/run";

/** Puts new job locations on the map. Each distinct location text costs one AI lookup, ever. */
async function geocode() {
  if (!isAiConfigured()) return;
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

// 1. Pull new Growth-bot findings from Airtable, fetch missing descriptions, then score them.
if (!isAirtableConfigured()) {
  console.log("[airtable] not configured, auto-sync disabled");
} else {
  const minutes = Number(process.env.AIRTABLE_SYNC_MINUTES) || 5;
  const run = async () => {
    // Scoring can outlast the interval; skip a tick rather than score the same jobs twice.
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

      if (isAiConfigured()) {
        const { scored, errors } = await scoreUnscoredJobs(getDb(), getSearchProfile(getDb()), 20);
        if (scored || errors.length) {
          console.log(`[score] scored ${scored}` + (errors.length ? `, ${errors.length} failed: ${errors[0]}` : ""));
        }
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
    // Without AI scoring every keyword match would be added; leave that to manual runs.
    if (!isAiConfigured() || !due()) return;
    const r = await runSearch(getDb());
    console.log(
      `[search] ${r.postings} postings, ${r.matchedFilters} matched filters, ${r.added} added` +
        (r.aiEnabled ? `, ${r.rejectedByAi} rejected by AI, ${r.rescored} scored` : " (no AI key)") +
        (r.errors.length ? `, ${r.errors.length} errors` : ""),
    );
    await geocode();
  };

  if (g.__searchTimer) clearInterval(g.__searchTimer);
  g.__searchTimer = setInterval(tick, 10 * 60_000);
  setTimeout(tick, 30_000);
  console.log(
    isAiConfigured() ? `[search] runs every ${hours} h` : "[search] auto-search waits for DEEPSEEK_API_KEY",
  );
}
