import { count } from "drizzle-orm";
import type { Db } from "@/db";
import { type AtsType, companies } from "@/db/schema";

// Starter list: companies from the Growth bot's findings plus Paris tech employers
// whose boards were checked to respond (Nov 2026). Manage them on the Search page.
const SEED: [name: string, ats: AtsType, slug: string][] = [
  ["360Learning", "lever", "360learning"],
  ["BlaBlaCar", "lever", "blablacar"],
  ["Contentsquare", "lever", "contentsquare"],
  ["Malt", "lever", "malt"],
  ["Pigment", "lever", "pigment"],
  ["Riot", "lever", "tryriot"],
  ["Scaleway", "lever", "scaleway"],
  ["Swile", "lever", "swile"],
  ["Theodo", "lever", "theodo"],
  ["Veepee", "lever", "veepee"],
  ["Alan", "ashby", "alan"],
  ["Back Market", "ashby", "backmarket"],
  ["Doctolib", "ashby", "doctolib"],
  ["Dust", "ashby", "dust"],
  ["H Company", "ashby", "hcompany"],
  ["Ledger", "ashby", "ledger"],
  ["Mistral AI", "ashby", "mistral.ai"],
  ["Pennylane", "ashby", "pennylane"],
  ["Photoroom", "ashby", "photoroom"],
  ["Qonto", "ashby", "qonto"],
  ["Sorare", "ashby", "sorare"],
  ["Voodoo", "ashby", "voodoo"],
  ["Algolia", "greenhouse", "algolia"],
  ["Datadog", "greenhouse", "datadog"],
  ["Dataiku", "greenhouse", "dataiku"],
  ["Mirakl", "greenhouse", "mirakl"],
  ["SumUp", "greenhouse", "sumup"],
  ["Nexton", "smartrecruiters", "nexton"],
  ["Ubisoft", "smartrecruiters", "ubisoft2"],
  ["Quandela", "workable", "quandela"],
];

/** Inserts the starter list the first time the search runs. */
export function seedCompanies(db: Db) {
  const [{ n }] = db.select({ n: count() }).from(companies).all();
  if (n > 0) return;
  db.insert(companies)
    .values(SEED.map(([name, ats, slug]) => ({ name, ats, slug })))
    .run();
}
