import { describe, expect, it } from "vitest";
import { parseLinkedInJob } from "@/lib/jobs/description/parse";
import { companyKey, slugCandidates, titleKey, titlesMatch } from "./discover";
import { parseLinkedInCards } from "./linkedin";

describe("company and title matching", () => {
  it("treats legal forms and accents as noise in company names", () => {
    expect(companyKey("QONTO SAS")).toBe(companyKey("Qonto"));
    expect(companyKey("Société Générale")).toBe("societegenerale");
    expect(companyKey("Riot (YC W22)")).toBe("riot");
  });

  it("guesses board slugs from the company name", () => {
    expect(slugCandidates("Back Market")).toEqual(["backmarket", "back-market"]);
    expect(slugCandidates("Qonto SAS")).toEqual(["qonto"]);
  });

  it("matches the same job across sites, ignoring gender markers", () => {
    expect(titlesMatch("Ingénieur DevOps H/F", "Ingénieur DevOps (F/H)")).toBe(true);
    expect(titlesMatch("DevOps Engineer (M/W/D)", "DevOps Engineer - Paris")).toBe(true);
    expect(titleKey("Ingénieur DevOps H/F")).toBe(titleKey("ingenieur devops"));
  });

  it("does not match different jobs", () => {
    expect(titlesMatch("DevOps Engineer", "Data Engineer")).toBe(false);
    expect(titlesMatch("Site Reliability Engineer", "Software Engineer")).toBe(false);
  });
});

describe("LinkedIn parsing", () => {
  it("reads job cards from the guest search", () => {
    const html = `
      <li><div class="base-card" data-entity-urn="urn:li:jobPosting:4484331314">
        <h3 class="base-search-card__title">
          Ingénieur DevOps H/F
        </h3>
        <h4 class="base-search-card__subtitle"><a href="#">  Diggers </a></h4>
        <span class="job-search-card__location">Paris, Île-de-France, France</span>
        <time class="job-search-card__listdate--new" datetime="2026-11-02">19 hours ago</time>
      </div></li>
      <li><div class="base-card" data-entity-urn="urn:li:jobPosting:1"></div></li>`;
    const [card, ...rest] = parseLinkedInCards(html);
    expect(rest).toHaveLength(0);
    expect(card).toMatchObject({
      url: "https://www.linkedin.com/jobs/view/4484331314",
      title: "Ingénieur DevOps H/F",
      company: "Diggers",
      location: "Paris, Île-de-France, France",
      postedAt: "2026-11-02",
      source: "linkedin",
    });
  });

  it("reads the description and job criteria from the guest job page", () => {
    const html = `
      <span class="topcard__flavor topcard__flavor--bullet"> Paris, Île-de-France </span>
      <div class="show-more-less-html__markup"><strong>Ton challenge</strong><ul><li>CI/CD</li></ul></div>
      <ul><li class="description__job-criteria-item">
        <h3 class="description__job-criteria-subheader">Employment type</h3>
        <span class="description__job-criteria-text">  Full-time </span>
      </li></ul>`;
    const job = parseLinkedInJob(html);
    expect(job.location).toBe("Paris, Île-de-France");
    expect(job.text).toContain("Ton challenge");
    expect(job.text).toContain("• CI/CD");
    expect(job.text).toContain("Employment type: Full-time");
  });
});
