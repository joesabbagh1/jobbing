import { describe, expect, it } from "vitest";
import { parseJeanMichelJob } from "@/lib/jobs/description/parse";
import { parseJeanMichelCards, parseRelativeAge } from "./jeanmichel";

const NOW = Date.parse("2026-11-05T12:00:00Z");

const card = (id: number, tags: string, footer: string, age = "il y a 2 jours") => `
  <a class="relative flex" href="/annonces/${id}">
    <header>
      <div><img alt="Acme" src="/annonces/${id}/logo"/></div>
      <div>
        <div><span data-slot="tag">Acme</span><span data-slot="tag"><svg></svg>${age}</span></div>
        <h3>Ingénieur Cloud &amp; DevOps</h3>
      </div>
    </header>
    <div>${tags}</div>
    <footer><span data-slot="tag">Opportunité exclusive</span>${footer}</footer>
  </a>`;

const tag = (text: string) => `<span data-slot="tag">${text}</span>`;
const place = (city: string, dept: string) => `<span data-slot="tag"><span>${city}</span> (${dept})</span>`;

describe("parseRelativeAge", () => {
  it("turns the site's relative ages into dates", () => {
    expect(parseRelativeAge("il y a 37 minutes", NOW)).toBe("2026-11-05T11:23:00.000Z");
    expect(parseRelativeAge("il y a 9 heures", NOW)).toBe("2026-11-05T03:00:00.000Z");
    expect(parseRelativeAge("il y a 1 jour", NOW)).toBe("2026-11-04T12:00:00.000Z");
    expect(parseRelativeAge("il y a une semaine", NOW)).toBe("2026-10-29T12:00:00.000Z");
    expect(parseRelativeAge("il y a 2 mois", NOW)).toBe("2026-09-06T12:00:00.000Z");
  });

  it("returns nothing for text it doesn't recognise", () => {
    expect(parseRelativeAge("Tout chaud !", NOW)).toBeUndefined();
  });
});

describe("parseJeanMichelCards", () => {
  it("reads a card's fields", () => {
    const [job, ...rest] = parseJeanMichelCards(card(35547, place("paris", "75") + tag("Sur site"), tag("CDI")), NOW);
    expect(rest).toHaveLength(0);
    expect(job).toMatchObject({
      url: "https://consultant.jean-michel.io/annonces/35547",
      title: "Ingénieur Cloud & DevOps",
      company: "Acme",
      location: "Paris (75), Île-de-France, France",
      remote: false,
      postedAt: "2026-11-03T12:00:00.000Z",
      source: "jean-michel",
      cdi: true,
    });
  });

  it("tells permanent roles from freelance-only ones", () => {
    const cdi = (footer: string) => parseJeanMichelCards(card(1, "", footer), NOW)[0].cdi;
    expect(cdi(tag("CDI"))).toBe(true);
    expect(cdi(tag("Freelance") + tag("CDI"))).toBe(true);
    expect(cdi(tag("Freelance"))).toBe(false);
  });

  it("finds contract tags streamed in after the card", () => {
    const html = `${card(1, "", '<template id="P:7"></template><template id="P:8"></template>')}
      <div hidden id="S:7">${tag("CDI")}</div><div hidden id="S:8">${tag("60k€ /an")}</div>`;
    expect(parseJeanMichelCards(html, NOW)[0].cdi).toBe(true);
  });

  it("marks full remote, and leaves out unknown locations", () => {
    const [job] = parseJeanMichelCards(card(1, tag("Non précisé") + tag("100% remote"), tag("CDI")), NOW);
    expect(job.remote).toBe(true);
    expect(job.location).toBeUndefined();
  });

  it("only tags Île-de-France departments as such", () => {
    const location = (city: string, dept: string) =>
      parseJeanMichelCards(card(1, place(city, dept), tag("CDI")), NOW)[0].location;
    expect(location("lyon", "69")).toBe("Lyon (69), France");
    expect(location("saint-germain-en-laye", "78")).toBe("Saint-Germain-En-Laye (78), Île-de-France, France");
  });

  it("ignores links that aren't job cards", () => {
    expect(parseJeanMichelCards('<a href="/annonces/35773/postuler"><h3>Je postule</h3></a>', NOW)).toEqual([]);
  });
});

describe("parseJeanMichelJob", () => {
  it("joins the page's sections, and finds nothing on a removed job", () => {
    const html = `<article><div hidden id="S:c"><section><h4><span></span>Description de la mission</h4>
      <div class="prose">Automatiser la production.<br />Tout en Terraform.</div></section></div>
      <div hidden id="S:10"><h4>Profil recherché</h4><div class="prose">5 ans d'expérience.</div></div></article>`;
    const { text } = parseJeanMichelJob(html);
    expect(text).toContain("Description de la mission\nAutomatiser la production.");
    expect(text).toContain("Profil recherché\n5 ans d'expérience.");
    expect(parseJeanMichelJob("<main><h1>Page introuvable</h1></main>").text).toBe("");
  });
});
