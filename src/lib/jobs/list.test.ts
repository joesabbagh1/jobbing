import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { applications, jobs } from "@/db/schema";
import { groupJobs, listUrl, orderFor, parseListParams, primaryCity, sortUrl, whereFor } from "./list";
import { upsertJob } from "./upsert";

const TODAY = "2026-11-02";

describe("parseListParams / listUrl", () => {
  it("parses known values, ignores unknown ones, and round-trips", () => {
    const p = parseListParams({ q: " devops ", status: "applied", match: "80", origin: "nope", group: "company", sort: "x", due: "1" });
    expect(p).toMatchObject({ q: "devops", status: "applied", match: "80", origin: undefined, group: "company", sort: "added", dir: "desc", due: true });
    expect(listUrl(p)).toBe("/?q=devops&status=applied&match=80&due=1&group=company");
    expect(listUrl(p, { status: undefined, due: false })).toBe("/?q=devops&match=80&group=company");
    expect(listUrl(parseListParams({}))).toBe("/");
  });
});

describe("filtering", () => {
  let db: Db;
  const ids: Record<string, number> = {};
  const query = (raw: Record<string, string>) =>
    db
      .select()
      .from(jobs)
      .where(whereFor(parseListParams(raw), TODAY))
      .orderBy(...orderFor(parseListParams(raw).sort, parseListParams(raw).dir))
      .all()
      .map((j) => j.title);

  beforeEach(() => {
    db = createDb(":memory:");
    const add = (title: string, company: string, location: string, score: number | null, extra: Partial<typeof jobs.$inferInsert> = {}) => {
      const { id } = upsertJob(db, { url: `https://x.io/${title.replace(/\W+/g, "-")}`, title, company, location }, "search");
      db.update(jobs).set({ matchScore: score, ...extra }).where(eq(jobs.id, id)).run();
      ids[title] = id;
    };
    add("DevOps Engineer", "Doctolib", "Paris, France", 88, { description: "Kubernetes and Terraform on AWS" });
    add("SRE", "Algolia", "Paris", 62, { description: "On-call, 100% uptime" });
    add("Cloud Engineer", "Ippon", "Lyon, FR", 45);
    add("Platform Engineer", "Doctolib", "Hybrid Paris; London", null, { status: "applied" });
    db.insert(applications)
      .values({ jobId: ids["Platform Engineer"], cv: {}, cvPdf: Buffer.from(""), cvFilename: "cv.pdf", followUpOn: "2026-11-01" })
      .run();
  });

  it("searches every word across title, company, location and description", () => {
    expect(query({ q: "doctolib" })).toEqual(["Platform Engineer", "DevOps Engineer"]);
    expect(query({ q: "terraform paris" })).toEqual(["DevOps Engineer"]);
    expect(query({ q: "lyon" })).toEqual(["Cloud Engineer"]);
  });

  it("treats % and _ literally", () => {
    expect(query({ q: "100%" })).toEqual(["SRE"]);
    expect(query({ q: "%" })).toEqual(["SRE"]);
  });

  it("filters by match band, description, status and due follow-ups", () => {
    expect(query({ match: "80" })).toEqual(["DevOps Engineer"]);
    expect(query({ match: "60", sort: "score" })).toEqual(["DevOps Engineer", "SRE"]);
    expect(query({ match: "low" })).toEqual(["Cloud Engineer"]);
    expect(query({ match: "none" })).toEqual(["Platform Engineer"]);
    expect(query({ jd: "no" }).sort()).toEqual(["Cloud Engineer", "Platform Engineer"]);
    expect(query({ status: "applied" })).toEqual(["Platform Engineer"]);
    expect(query({ due: "1" })).toEqual(["Platform Engineer"]);
  });

  it("sorts by any column, in either direction", () => {
    expect(query({ sort: "company" })).toEqual(["SRE", "DevOps Engineer", "Platform Engineer", "Cloud Engineer"]);
    expect(query({ sort: "title" })).toEqual(["Cloud Engineer", "DevOps Engineer", "Platform Engineer", "SRE"]);
    expect(query({ sort: "title", dir: "desc" })).toEqual(["SRE", "Platform Engineer", "DevOps Engineer", "Cloud Engineer"]);
    expect(query({ sort: "match", dir: "asc" })).toEqual(["Cloud Engineer", "SRE", "DevOps Engineer", "Platform Engineer"]); // unscored last
    expect(query({ sort: "location" })).toEqual(["Platform Engineer", "Cloud Engineer", "SRE", "DevOps Engineer"]);
    expect(query({ sort: "status", dir: "desc" })[0]).toBe("Platform Engineer"); // applied after new
    expect(query({ sort: "score" })[0]).toBe("DevOps Engineer"); // legacy ?sort=score link
  });

  it("builds header links that flip the direction of the active column", () => {
    const p = parseListParams({ sort: "title" });
    expect(sortUrl(p, "title")).toBe("/?sort=title&dir=desc");
    expect(sortUrl(parseListParams({ sort: "title", dir: "desc" }), "title")).toBe("/?sort=title");
    expect(sortUrl(p, "match")).toBe("/?sort=match");
    expect(sortUrl(parseListParams({}), "added")).toBe("/?dir=asc");
  });

  it("groups by company (largest first), match band and city", () => {
    const all = db.select().from(jobs).orderBy(...orderFor("match")).all();
    expect(groupJobs(all, "company").map((g) => [g.label, g.jobs.length])).toEqual([
      ["Doctolib", 2],
      ["Algolia", 1],
      ["Ippon", 1],
    ]);
    expect(groupJobs(all, "match").map((g) => g.label)).toEqual(["80+ (apply)", "60–79 (worth a look)", "Under 60", "Unscored"]);
    expect(groupJobs(all, "location").map((g) => [g.label, g.jobs.length])).toEqual([
      ["Paris", 3],
      ["Lyon", 1],
    ]);
  });
});

describe("primaryCity", () => {
  it("takes the first place, without hybrid/remote prefixes", () => {
    expect(primaryCity("Saint-Mandé, IDF, France")).toBe("Saint-Mandé");
    expect(primaryCity("Hybrid Paris; Hybrid London")).toBe("Paris");
    expect(primaryCity(null)).toBe("Unknown");
  });
});
