import { describe, expect, it } from "vitest";
import { franceTravailLocation, offerToPosting } from "./francetravail";
import { parseBoardUrl, parseFrenchDate, parseLuccaBoard, parseTeamtailorRss } from "./sources";

describe("parseFrenchDate", () => {
  it("reads Lucca's French dates", () => {
    expect(parseFrenchDate("vendredi 13 novembre 2026")).toBe("2026-11-13");
    expect(parseFrenchDate("1 août 2026")).toBe("2026-08-01");
  });
  it("gives up on text without a date", () => {
    expect(parseFrenchDate("")).toBeUndefined();
  });
});

describe("parseLuccaBoard", () => {
  const card = (href: string, title: string, contract: string) => `
    <li class="jobBoard-offers-item card">
      <h3><a class="jobBoard-offers-item-link card-link" href="${href}">
        ${title}
      </a></h3>
      <div class="jobBoard-offers-item-time"><span></span> vendredi 13 novembre 2026 </div>
      <div class="jobBoard-offers-item-tags">
        <span class="tag palette-glacier">Lyon, Auvergne-Rh&#xF4;ne-Alpes, France</span>
        <span class="tag palette-lime"> ${contract} </span>
      </div>
    </li>`;
  const html = `<ul>${card("/acme/ingenieur-sre-fh-1", "Ing&#xE9;nieur SRE [Kubernetes] F/H", "CDI")}${card(
    "/acme/stage-devops-2",
    "Stage DevOps",
    "Stage",
  )}</ul>`;

  it("lists permanent offers with their date and city", () => {
    const [p, ...rest] = parseLuccaBoard(html, "acme", "Acme");
    expect(rest).toHaveLength(0);
    expect(p).toMatchObject({
      url: "https://jobs.world.luccasoftware.com/acme/ingenieur-sre-fh-1",
      title: "Ingénieur SRE [Kubernetes] F/H",
      company: "Acme",
      location: "Lyon, Auvergne-Rhône-Alpes, France",
      postedAt: "2026-11-13",
    });
  });
});

describe("parseTeamtailorRss", () => {
  const xml = `<rss><channel><item>
    <title>Ingénieur DevOps F/H</title>
    <description>&lt;p&gt;Kubernetes &amp;amp; Terraform&lt;/p&gt;</description>
    <pubDate>Thu, 19 Nov 2026 17:45:05 +0100</pubDate>
    <link>https://careers.acme.fr/jobs/123-ingenieur-devops</link>
    <remoteStatus>hybrid</remoteStatus>
    <tt:locations><tt:location><tt:city>Lyon</tt:city></tt:location></tt:locations>
  </item></channel></rss>`;

  it("reads each job with its description", () => {
    expect(parseTeamtailorRss(xml, "Acme")).toEqual([
      {
        url: "https://careers.acme.fr/jobs/123-ingenieur-devops",
        title: "Ingénieur DevOps F/H",
        company: "Acme",
        location: "Lyon",
        remote: false,
        postedAt: "2026-11-19T16:45:05.000Z",
        description: "Kubernetes & Terraform",
      },
    ]);
  });
});

describe("parseBoardUrl, newer boards", () => {
  it("recognises Lucca, Teamtailor and Recruitee", () => {
    expect(parseBoardUrl("https://jobs.world.luccasoftware.com/cloud-temple")).toEqual({
      ats: "lucca",
      slug: "cloud-temple",
    });
    expect(parseBoardUrl("https://deezer.teamtailor.com/jobs")).toEqual({ ats: "teamtailor", slug: "deezer" });
    expect(parseBoardUrl("teamtailor:recrutement.carter-cash.com")).toEqual({
      ats: "teamtailor",
      slug: "recrutement.carter-cash.com",
    });
    expect(parseBoardUrl("https://bunq.recruitee.com/")).toEqual({ ats: "recruitee", slug: "bunq" });
  });
});

describe("France Travail offers", () => {
  it("tidies the location", () => {
    expect(franceTravailLocation("69 - LYON 03")).toBe("Lyon 03 (69)");
    expect(franceTravailLocation("2A - AJACCIO")).toBe("Ajaccio (2A)");
    expect(franceTravailLocation("Ile-de-France")).toBe("Ile-de-France");
  });

  it("turns an offer into a posting", () => {
    expect(
      offerToPosting({
        id: "201ABCD",
        intitule: "Ingénieur DevOps (H/F)",
        description: "Kubernetes",
        dateCreation: "2026-11-18T10:00:00.000Z",
        lieuTravail: { libelle: "31 - TOULOUSE" },
      }),
    ).toMatchObject({
      url: "https://candidat.francetravail.fr/offres/recherche/detail/201ABCD",
      company: "Entreprise non communiquée",
      location: "Toulouse (31)",
      source: "francetravail",
    });
  });
});
