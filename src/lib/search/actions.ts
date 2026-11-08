"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { saveSearchProfile, searchProfileSchema } from "./profile";
import { runSearch } from "./run";
import { listPostings, parseBoardUrl } from "./sources";

export type ActionState = { ok?: string; error?: string };

export async function startSearch() {
  // Runs in the background; the page shows progress via isSearchRunning().
  void runSearch(getDb());
  revalidatePath("/search");
}

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

export async function saveProfile(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = searchProfileSchema.safeParse({
    titleKeywords: list(formData.get("titleKeywords")),
    excludeTitleKeywords: list(formData.get("excludeTitleKeywords")),
    locations: list(formData.get("locations")),
    maxAgeDays: Number(formData.get("maxAgeDays")),
    minScore: Number(formData.get("minScore")),
    about: String(formData.get("about") ?? ""),
    linkedin: {
      enabled: formData.get("linkedinEnabled") === "on",
      queries: list(formData.get("linkedinQueries")),
      location: String(formData.get("linkedinLocation") ?? ""),
    },
    jeanMichel: {
      enabled: formData.get("jeanMichelEnabled") === "on",
      queries: list(formData.get("jeanMichelQueries")),
    },
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  saveSearchProfile(getDb(), parsed.data);
  revalidatePath("/search");
  return { ok: "Saved. The next search uses the new profile." };
}

export async function addCompany(_: ActionState, formData: FormData): Promise<ActionState> {
  const board = parseBoardUrl(String(formData.get("board") ?? ""));
  if (!board) {
    return {
      error:
        "Unrecognised board. Paste a Lever, Ashby, Greenhouse, SmartRecruiters or Workable careers URL, or ats:slug.",
    };
  }
  const name = String(formData.get("name") ?? "").trim() || board.slug;
  try {
    const postings = await listPostings({ ...board, name });
    const db = getDb();
    db.insert(companies)
      .values({ ...board, name, lastJobCount: postings.length })
      .onConflictDoUpdate({ target: [companies.ats, companies.slug], set: { name, enabled: true } })
      .run();
    revalidatePath("/search");
    return { ok: `Added ${name} (${board.ats}, ${postings.length} open positions).` };
  } catch (err) {
    return { error: `Couldn't read that board: ${(err as Error).message}` };
  }
}

export async function toggleCompany(id: number, enabled: boolean) {
  getDb().update(companies).set({ enabled }).where(eq(companies.id, id)).run();
  revalidatePath("/search");
}

export async function removeCompany(id: number) {
  getDb().delete(companies).where(eq(companies.id, id)).run();
  revalidatePath("/search");
}
