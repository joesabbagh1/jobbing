import type { CSSProperties } from "react";
import { type Cv, HEADINGS, PAPER } from "@/lib/cv/schema";

// Reproduces the candidate's Google Docs CV. All spacing comes from the .docx export of that document
// (twips → pt), which builds its rhythm from "before/after" spacing plus small empty spacer paragraphs:
//   • body: Times New Roman 9pt, single spacing ≈ 10.35pt per line (1.15 × font size)
//   • experience/project bullets: line=267/240 → 11.5pt per line; skill bullets: single spacing
//   • bullets: ● at the margin, text indented 360 twips (18pt)
//   • headings: bold caps with a 0.75pt bottom rule, 1pt below the text
// Spacing uses spacer divs (not margins) so nothing collapses unexpectedly.
// Single column and real text, so ATS parsers read it cleanly. Used for both the preview and the PDF.

const visible = <T extends { hidden?: boolean }>(items: T[]) => items.filter((i) => !i.hidden);
const LINK = "text-[#1155cc] underline";
const BULLET_LINE = "leading-[11.5pt]";

/** Empty paragraph of a given height, like the docx's small-font blank lines. */
const Spacer = ({ pt }: { pt: number }) => <div aria-hidden style={{ height: `${pt}pt` }} />;

function dates(start: string, end: string) {
  return [start, end].filter(Boolean).join(" - ");
}

/** Spacer before the heading, the ruled heading, then `firstGap` before the content. */
function Section({
  title,
  before,
  firstGap,
  children,
}: {
  title: string;
  before: number;
  firstGap: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <Spacer pt={before} />
      <h2 className="border-b-[0.75pt] border-black pb-[1pt] font-bold uppercase">{title}</h2>
      <Spacer pt={firstGap} />
      {children}
    </section>
  );
}

function Bullets({
  items,
  lineClass = BULLET_LINE,
}: {
  items: { key: string; content: React.ReactNode }[];
  lineClass?: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="list-none">
      {items.map((b) => (
        // Hanging indent instead of an absolutely positioned bullet: positioned elements are painted (and so written
        // to the PDF) after the normal flow, which would put every bullet at the end of the text for ATS parsers.
        <li key={b.key} className={`pl-[18pt] -indent-[18pt] ${lineClass}`}>
          <span aria-hidden className="inline-block w-[18pt] indent-0 font-[Arial,sans-serif] text-[8pt]">
            ●
          </span>
          {b.content}
        </li>
      ))}
    </ul>
  );
}

/** "Company, City ............ dates" with the name optionally linked. */
function EntryLine({ name, url, place, when }: { name: string; url?: string; place?: string; when?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span>
        {url ? (
          <a href={url} className={`font-bold ${LINK}`}>
            {name}
          </a>
        ) : (
          <span className="font-bold">{name}</span>
        )}
        {place && `, ${place}`}
      </span>
      {when && <span className="shrink-0">{when}</span>}
    </div>
  );
}

const bulletItems = (bullets: { id: string; text: string; hidden?: boolean }[]) =>
  visible(bullets)
    .filter((b) => b.text.trim())
    .map((b) => ({ key: b.id, content: b.text }));

export function CvTemplate({ cv }: { cv: Cv }) {
  const h = HEADINGS[cv.language];
  const paper = PAPER[cv.paper];
  const { basics } = cv;
  const colon = cv.language === "fr" ? " : " : ": ";
  const contact = [basics.location, basics.phone, basics.email].filter(Boolean);
  const links = basics.links.filter((l) => l.url || l.label);
  const experience = visible(cv.experience);
  const projects = visible(cv.projects);
  const education = visible(cv.education);
  const skills = visible(cv.skills).filter((s) => s.items.trim());
  const certifications = visible(cv.certifications);
  const languages = visible(cv.languages);
  const interests = visible(cv.interests);
  const languageLine = languages.map((l) => (l.detail ? `${l.name} (${l.detail})` : l.name)).join(", ");
  const withPeriod = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

  // The spacer before a heading depends on how the previous section ended (docx: 6pt or 6pt×1.11 blank line;
  // Google Docs renders the 3pt blank line under the header taller than nominal, and the one after the
  // certifications has an extra 3pt before it). Values tuned against the original PDF.
  type Ending = "header" | "prose" | "bullets" | "certifications";
  const GAP: Record<Ending, number> = { header: 7.5, prose: 6.9, bullets: 7.7, certifications: 9.9 };
  let previous: Ending = "header";
  const before = (endsWith: Exclude<Ending, "header">) => {
    const gap = GAP[previous];
    previous = endsWith;
    return gap;
  };
  const endsWithBullets = (items: { bullets: { id: string; text: string; hidden?: boolean }[] }[]) =>
    items.length > 0 && bulletItems(items[items.length - 1].bullets).length > 0 ? "bullets" : "prose";

  const style = {
    "--page-w": `${paper.width}mm`,
    "--page-h": `${paper.height}mm`,
    "--page-margin": `${paper.margin}mm`,
    paddingLeft: `${paper.margin}mm`,
    paddingRight: `${paper.margin}mm`,
  } as CSSProperties;

  return (
    <article
      lang={cv.language}
      style={style}
      className="cv-page bg-white font-['Times_New_Roman',Times,serif] text-[9pt] leading-[1.15] text-black"
    >
      <header>
        <h1 className="text-[11pt] font-bold">{basics.name || "Your Name"}</h1>
        {basics.headline && <p>{basics.headline}</p>}
        {(contact.length > 0 || links.length > 0) && (
          <p>
            {[
              ...contact.map((c) => <span key={c}>{c}</span>),
              ...links.map((l) =>
                l.url ? (
                  <a key={l.id} href={l.url} className={LINK}>
                    {l.label || l.url.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                ) : (
                  <span key={l.id}>{l.label}</span>
                ),
              ),
            ].flatMap((el, i) => (i === 0 ? [el] : [<span key={`sep${i}`}> | </span>, el]))}
          </p>
        )}
      </header>

      {cv.summary.trim() && (
        <Section title={h.summary} before={before("prose")} firstGap={3}>
          <p className="whitespace-pre-line">{cv.summary}</p>
        </Section>
      )}

      {experience.length > 0 && (
        <Section title={h.experience} before={before(endsWithBullets(experience))} firstGap={5}>
          {experience.map((e, i) => (
            <div key={e.id} className="break-inside-avoid">
              {i > 0 && <Spacer pt={6} />}
              <EntryLine name={e.company} url={e.url} place={e.location} when={dates(e.start, e.end)} />
              {e.role && <p className="italic">{e.role}</p>}
              {bulletItems(e.bullets).length > 0 && <Spacer pt={4} />}
              <Bullets items={bulletItems(e.bullets)} />
            </div>
          ))}
        </Section>
      )}

      {education.length > 0 && (
        <Section title={h.education} before={before("prose")} firstGap={5}>
          {education.map((e, i) => (
            <div key={e.id} className="break-inside-avoid">
              {i > 0 && <Spacer pt={3} />}
              <div className="flex items-baseline justify-between gap-6">
                <span className="font-bold">{[e.school, e.location].filter(Boolean).join(", ")}</span>
                <span className="shrink-0">{dates(e.start, e.end)}</span>
              </div>
              {e.degree && <p>{e.degree}</p>}
              {e.details && <p className="whitespace-pre-line">{e.details}</p>}
            </div>
          ))}
        </Section>
      )}

      {projects.length > 0 && (
        <Section title={h.projects} before={before(endsWithBullets(projects))} firstGap={5}>
          {projects.map((p) => (
            <div key={p.id} className="break-inside-avoid">
              <div>
                {p.url ? (
                  <a href={p.url} className={`font-bold ${LINK}`}>
                    {p.name}
                  </a>
                ) : (
                  <span className="font-bold">{p.name}</span>
                )}
              </div>
              {p.description && <p>{p.description}</p>}
              {bulletItems(p.bullets).length > 0 && <Spacer pt={3} />}
              <Bullets items={bulletItems(p.bullets)} />
            </div>
          ))}
        </Section>
      )}

      {certifications.length > 0 && (
        <Section title={h.certifications} before={before("certifications")} firstGap={3}>
          {certifications.map((c) => (
            <p key={c.id}>{c.detail ? `${c.name}${colon}${c.detail}` : c.name}</p>
          ))}
        </Section>
      )}

      {(skills.length > 0 || languages.length > 0) && (
        <Section title={h.skills} before={before("prose")} firstGap={3}>
          <Bullets
            lineClass=""
            items={[
              ...skills.map((s) => ({
                key: s.id,
                content: (
                  <>
                    {s.category && (
                      <span className="font-bold">
                        {s.category}
                        {colon}
                      </span>
                    )}
                    {withPeriod(s.items)}
                  </>
                ),
              })),
              ...(languages.length
                ? [
                    {
                      key: "languages",
                      content: (
                        <>
                          <span className="font-bold">
                            {h.languages}
                            {colon}
                          </span>
                          {withPeriod(languageLine)}
                        </>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </Section>
      )}

      {interests.length > 0 && (
        <Section title={h.interests} before={before("prose")} firstGap={5}>
          <p>{withPeriod(interests.map((i) => [i.name, i.detail].filter(Boolean).join(" ")).join(", "))}</p>
        </Section>
      )}
    </article>
  );
}
