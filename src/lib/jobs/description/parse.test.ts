import { describe, expect, it } from "vitest";
import {
  htmlToText,
  parseGreenhouse,
  parseJsonLd,
  parseLever,
  parseSmartRecruiters,
  parseWelcomeToTheJungle,
} from "./parse";

describe("htmlToText", () => {
  it("keeps block structure and drops link targets", () => {
    const text = htmlToText('<h3>Missions</h3><ul><li>Run <a href="https://x.y">K8s</a></li><li>Ship</li></ul>');
    expect(text).toBe("Missions\n\n• Run K8s\n• Ship");
  });

  it("decodes HTML that was entity-escaped once", () => {
    expect(htmlToText("&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;p&gt;Bye&lt;/p&gt;")).toBe(
      "Hello & welcome\n\nBye",
    );
  });
});

describe("ATS parsers", () => {
  it("Lever: combines description, lists and closing text", () => {
    const r = parseLever({
      descriptionPlain: "Intro",
      lists: [{ text: "You will", content: "<li>Build</li><li>Operate</li>" }],
      additionalPlain: "Benefits",
      categories: { location: "Paris" },
    });
    expect(r.text).toBe("Intro\n\nYou will\n• Build\n• Operate\n\nBenefits");
    expect(r.location).toBe("Paris");
  });

  it("Greenhouse: decodes escaped content", () => {
    const r = parseGreenhouse({ content: "&lt;p&gt;Run infra&lt;/p&gt;", location: { name: "Paris" } });
    expect(r).toEqual({ text: "Run infra", location: "Paris" });
  });

  it("SmartRecruiters: orders known sections first", () => {
    const r = parseSmartRecruiters({
      jobAd: {
        sections: {
          qualifications: { title: "Profile", text: "<p>3 years</p>" },
          jobDescription: { title: "Job", text: "<p>Do DevOps</p>" },
        },
      },
    });
    expect(r.text).toBe("Job\nDo DevOps\n\nProfile\n3 years");
  });

  it("Welcome to the Jungle: description, profile and process", () => {
    const r = parseWelcomeToTheJungle({
      description: "<p>Missions</p>",
      profile: "<p>Profil</p>",
      recruitment_process: "<p>2 calls</p>",
      office: { city: "Paris", country: "France" },
    });
    expect(r).toEqual({
      text: "Missions\n\nProfil\n\nRecruitment process\n2 calls",
      location: "Paris, France",
    });
  });
});

describe("parseJsonLd", () => {
  const page = (type: string, json: object) =>
    `<html><head><script type="${type}">${JSON.stringify(json)}</script></head></html>`;

  it("finds a JobPosting inside @graph, with escaped type attribute", () => {
    const html = page("application/ld&#x2B;json", {
      "@graph": [
        { "@type": "Organization", name: "Acme" },
        {
          "@type": "JobPosting",
          description: "<p>Build things</p>",
          jobLocation: { address: { addressLocality: "Lyon", addressCountry: { name: "France" } } },
        },
      ],
    });
    expect(parseJsonLd(html)).toEqual({ text: "Build things", location: "Lyon, France" });
  });

  it("returns null without a JobPosting or with broken JSON", () => {
    expect(parseJsonLd(page("application/ld+json", { "@type": "Organization" }))).toBeNull();
    expect(parseJsonLd('<script type="application/ld+json">{broken</script>')).toBeNull();
  });
});
