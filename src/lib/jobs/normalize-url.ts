// Query params that only track where a click came from. Anything else is kept,
// because some boards put the job ID in the query string (e.g. ?gh_jid=, ?jk=).
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "msclkid",
  "ref",
  "refid",
  "trackingid",
  "trk",
  "trkinfo",
  "src",
  "source",
  "origin",
  "lipi",
  "ebp",
  "eid",
]);

/** Canonical form of a job URL, used as the dedupe key. */
export function normalizeJobUrl(raw: string): string {
  const url = new URL(raw.trim());
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.protocol === "http:") url.protocol = "https:";

  for (const key of [...url.searchParams.keys()]) {
    const k = key.toLowerCase();
    if (k.startsWith("utm_") || TRACKING_PARAMS.has(k)) url.searchParams.delete(key);
  }
  url.searchParams.sort();

  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");

  // Same posting, different URL shapes on some ATSs.
  if (url.hostname === "apply.workable.com") {
    // /{account}/j/{code} and /j/{code} are the same job.
    url.pathname = url.pathname.replace(/^\/[^/]+(\/j\/[^/]+)/, "$1");
  }
  if (url.hostname === "boards.greenhouse.io") url.hostname = "job-boards.greenhouse.io";
  // fr.linkedin.com/jobs/view/devops-engineer-at-acme-123?position=1… and /jobs/search?currentJobId=123 are job 123.
  if (url.hostname.endsWith("linkedin.com")) {
    const id = linkedInJobId(url);
    if (id) return `https://linkedin.com/jobs/view/${id}`;
  }
  return url.toString();
}

/** The numeric job ID in a LinkedIn job URL, if it has one. */
export function linkedInJobId(url: URL): string | undefined {
  return (
    url.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d+)\/?$/)?.[1] ??
    url.searchParams.get("currentJobId")?.match(/^\d+$/)?.[0]
  );
}
