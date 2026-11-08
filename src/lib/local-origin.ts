import { headers } from "next/headers";

/**
 * This app's own origin, for the headless browser to load print pages from.
 * Only local hosts are trusted, so a forged Host header can't point the browser elsewhere.
 */
export async function localOrigin(): Promise<string> {
  const host = (await headers()).get("host") ?? "";
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) ? `http://${host}` : "http://127.0.0.1:3000";
}
