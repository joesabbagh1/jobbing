import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { jobs } from "@/db/schema";
import { normalizeJobUrl } from "./normalize-url";
import { upsertJob } from "./upsert";

describe("normalizeJobUrl", () => {
  it("strips tracking params, hash, www and trailing slash", () => {
    expect(
      normalizeJobUrl("http://www.LinkedIn.com/jobs/view/123/?utm_source=x&trk=abc&refId=9#top"),
    ).toBe("https://linkedin.com/jobs/view/123");
  });

  it("reduces LinkedIn job URLs to the job ID", () => {
    expect(
      normalizeJobUrl("https://fr.linkedin.com/jobs/view/ing%C3%A9nieur-devops-h-f-at-diggers-4484331314?position=1&pageNum=0"),
    ).toBe("https://linkedin.com/jobs/view/4484331314");
    expect(normalizeJobUrl("https://www.linkedin.com/jobs/search/?currentJobId=4476145373&keywords=devops")).toBe(
      "https://linkedin.com/jobs/view/4476145373",
    );
  });

  it("collapses equivalent ATS URL shapes", () => {
    expect(normalizeJobUrl("https://apply.workable.com/quandela/j/7445534397/")).toBe(
      "https://apply.workable.com/j/7445534397",
    );
    expect(normalizeJobUrl("https://apply.workable.com/j/7445534397")).toBe("https://apply.workable.com/j/7445534397");
    expect(normalizeJobUrl("https://boards.greenhouse.io/algolia/jobs/1")).toBe(
      "https://job-boards.greenhouse.io/algolia/jobs/1",
    );
  });

  it("keeps params that identify the job", () => {
    expect(normalizeJobUrl("https://boards.greenhouse.io/acme?gh_jid=42&utm_medium=email")).toBe(
      "https://job-boards.greenhouse.io/acme?gh_jid=42",
    );
    expect(normalizeJobUrl("https://indeed.com/viewjob?jk=abc&from=serp")).toBe(
      "https://indeed.com/viewjob?from=serp&jk=abc",
    );
  });
});

describe("upsertJob", () => {
  let db: Db;
  beforeEach(() => {
    db = createDb(":memory:");
  });

  it("creates a job, then dedupes a tracking-param variant of the same URL", () => {
    const first = upsertJob(db, { url: "https://acme.com/jobs/1", title: "Engineer", company: "Acme" });
    const second = upsertJob(db, { url: "https://www.acme.com/jobs/1/?utm_source=grok", title: "Engineer" });
    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
    expect(db.select().from(jobs).all()).toHaveLength(1);
  });

  it("fills missing fields without overwriting user data", () => {
    const { id } = upsertJob(db, { url: "https://acme.com/jobs/1", title: "Engineer" });
    db.update(jobs).set({ status: "applied", notes: "sent" }).where(eq(jobs.id, id)).run();

    upsertJob(db, {
      url: "https://acme.com/jobs/1",
      title: "Engineer",
      company: "Acme",
      description: "Build things",
    });

    const job = db.select().from(jobs).where(eq(jobs.id, id)).get()!;
    expect(job).toMatchObject({ company: "Acme", description: "Build things", status: "applied", notes: "sent" });
  });

  it("dedupes on Airtable ID even if the URL changed", () => {
    const a = upsertJob(db, { url: "https://acme.com/jobs/1", title: "Engineer", airtableId: "rec1" });
    const b = upsertJob(db, { url: "https://acme.com/careers/1", title: "Engineer", airtableId: "rec1" });
    expect(b).toEqual({ id: a.id, created: false });
  });

  it("rejects invalid input", () => {
    expect(() => upsertJob(db, { url: "not a url", title: "x" })).toThrow();
    expect(() => upsertJob(db, { url: "javascript:alert(1)", title: "x" })).toThrow();
    expect(() => upsertJob(db, { url: "https://acme.com/1", title: "  " })).toThrow();
  });
});
