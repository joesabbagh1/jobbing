import { describe, expect, it } from "vitest";
import { containsKeyword, prefilter } from "./filter";
import { DEFAULT_PROFILE } from "./profile";
import { parseBoardUrl, type Posting } from "./sources";

const posting = (over: Partial<Posting>): Posting => ({
  url: "https://jobs.lever.co/acme/1",
  title: "DevOps Engineer",
  company: "Acme",
  location: "Paris, France",
  ...over,
});
const NOW = Date.parse("2026-11-02T12:00:00Z");

describe("containsKeyword", () => {
  it("matches whole words, plurals and ignores accents", () => {
    expect(containsKeyword("Site Reliability Engineer (SRE)", "sre")).toBe(true);
    expect(containsKeyword("Quality Assurance Lead", "sre")).toBe(false);
    expect(containsKeyword("International Sales", "intern")).toBe(false);
    expect(containsKeyword("Software Engineering Intern", "intern")).toBe(true);
    expect(containsKeyword("Cloud Platforms Engineer", "platform")).toBe(true);
    expect(containsKeyword("Saint-Mandé, Île-de-France", "ile-de-france")).toBe(true);
  });
});

describe("prefilter", () => {
  it("passes a matching recent Paris role", () => {
    expect(prefilter(posting({ postedAt: "2026-10-20T00:00:00Z" }), DEFAULT_PROFILE, NOW)).toEqual({ pass: true });
  });

  it("drops unrelated, excluded, far-away and stale postings", () => {
    expect(prefilter(posting({ title: "Account Executive" }), DEFAULT_PROFILE, NOW)).toEqual({
      pass: false,
      reason: "title",
    });
    expect(prefilter(posting({ title: "DevOps Intern" }), DEFAULT_PROFILE, NOW)).toEqual({
      pass: false,
      reason: "excluded",
    });
    expect(prefilter(posting({ location: "New York, NY" }), DEFAULT_PROFILE, NOW)).toEqual({
      pass: false,
      reason: "location",
    });
    expect(prefilter(posting({ postedAt: "2026-06-01T00:00:00Z" }), DEFAULT_PROFILE, NOW)).toEqual({
      pass: false,
      reason: "age",
    });
  });

  it("lets remote postings through on location so the AI can judge them", () => {
    expect(prefilter(posting({ location: "Berlin", remote: true }), DEFAULT_PROFILE, NOW).pass).toBe(true);
  });
});

describe("parseBoardUrl", () => {
  it("recognises careers URLs and shorthand", () => {
    expect(parseBoardUrl("https://jobs.lever.co/acme/123-abc")).toEqual({ ats: "lever", slug: "acme" });
    expect(parseBoardUrl("https://jobs.ashbyhq.com/mistral.ai")).toEqual({ ats: "ashby", slug: "mistral.ai" });
    expect(parseBoardUrl("https://job-boards.greenhouse.io/datadog/jobs/42")).toEqual({
      ats: "greenhouse",
      slug: "datadog",
    });
    expect(parseBoardUrl("https://boards.greenhouse.io/embed/job_board?for=algolia")).toEqual({
      ats: "greenhouse",
      slug: "algolia",
    });
    expect(parseBoardUrl("https://apply.workable.com/quandela/")).toEqual({ ats: "workable", slug: "quandela" });
    expect(parseBoardUrl("workable:huggingface")).toEqual({ ats: "workable", slug: "huggingface" });
    expect(parseBoardUrl("https://www.linkedin.com/company/acme")).toBeNull();
  });
});
