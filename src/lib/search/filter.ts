import type { SearchProfile } from "./profile";
import type { Posting } from "./sources";

/** Lowercase and strip accents so "Île-de-France" matches "ile-de-france". */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word match (plural "s" allowed), so "sre" doesn't match "assurance" nor "intern" "international". */
export function containsKeyword(text: string, keyword: string): boolean {
  const kw = escapeRegex(normalize(keyword.trim()));
  return new RegExp(`(^|[^a-z0-9])${kw}s?([^a-z0-9]|$)`).test(normalize(text));
}

export type FilterResult = { pass: true } | { pass: false; reason: "title" | "excluded" | "location" | "age" };

/** Cheap checks that run before any AI call. */
export function prefilter(p: Posting, profile: SearchProfile, now = Date.now()): FilterResult {
  if (!profile.titleKeywords.some((k) => containsKeyword(p.title, k))) return { pass: false, reason: "title" };
  if (profile.excludeTitleKeywords.some((k) => containsKeyword(p.title, k))) return { pass: false, reason: "excluded" };

  if (profile.locations.length > 0 && p.location) {
    const where = `${p.location} ${p.remote ? "remote" : ""}`;
    if (!profile.locations.some((k) => containsKeyword(where, k))) return { pass: false, reason: "location" };
  }

  if (p.postedAt) {
    const ageDays = (now - Date.parse(p.postedAt)) / 86_400_000;
    if (ageDays > profile.maxAgeDays) return { pass: false, reason: "age" };
  }
  return { pass: true };
}
