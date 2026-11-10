import { z } from "zod";
import { type Cv, type CvBullet, newId } from "./schema";

// AI tailoring works on operations that reference existing CV items by id. The model can
// hide, show, reorder or reword what's already there, and add bullets or projects only from
// the candidate's experience notes. Every operation is validated here before the user sees it.

const NEW_PROJECT = "list:projects";
/** Experience notes beyond this are cut from the prompt (~15k tokens), leaving room for the CV and posting. */
export const MAX_NOTES_CHARS = 60_000;

export const operationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("hide"), id: z.string(), reason: z.string().default("") }),
  z.object({ op: z.literal("show"), id: z.string(), reason: z.string().default("") }),
  z.object({ op: z.literal("move"), id: z.string(), position: z.coerce.number().int(), reason: z.string().default("") }),
  z.object({ op: z.literal("rewrite"), id: z.string(), text: z.string(), reason: z.string().default("") }),
  /** A new bullet for the job/project `id`, taken from the experience notes. */
  z.object({ op: z.literal("add"), id: z.string(), text: z.string(), reason: z.string().default("") }),
  /** A side project from the experience notes that isn't on the CV yet. */
  z.object({
    op: z.literal("addProject"),
    id: z.literal(NEW_PROJECT).default(NEW_PROJECT),
    name: z.string(),
    description: z.string().default(""),
    bullets: z.array(z.string()).default([]),
    reason: z.string().default(""),
  }),
]);
type ModelOperation = z.infer<typeof operationSchema>;
/** Moves are merged into one reorder per job/section before the user sees them. */
export type ReorderOperation = { op: "reorder"; id: string; order: string[]; reason: string };
export type Operation = ModelOperation | ReorderOperation;

/** A validated operation plus what the UI needs to show it. */
export type Suggestion = Operation & {
  key: string;
  /** Human label of the target, e.g. "Faradae · bullet 2". */
  target: string;
  /** Current text of the target (for diffs). */
  before: string;
  /** Terms in a rewrite that appear nowhere in the CV: the user should double-check them. */
  warnings: string[];
  /** For reorders: the items' text in their new order. */
  orderPreview?: string[];
  /** For bullets: the job/project they belong to. */
  parentId?: string;
};

export type Rejected = { op: unknown; why: string };

// Pseudo-ids for single fields.
const SUMMARY = "summary";
const HEADLINE = "headline";

type Located =
  | { kind: "field"; field: typeof SUMMARY | typeof HEADLINE; text: string; label: string }
  | { kind: "bullet"; bullet: CvBullet; siblings: number; label: string; parentId: string }
  | { kind: "item"; list: ListKey; index: number; count: number; text: string; hidden: boolean; label: string; rewritable: boolean };

const LISTS = ["experience", "projects", "education", "skills", "certifications", "languages", "interests"] as const;
type ListKey = (typeof LISTS)[number];

function itemText(list: ListKey, item: Record<string, unknown>): string {
  switch (list) {
    case "experience":
      return `${item.role} @ ${item.company}`;
    case "projects":
      return String(item.description || item.name);
    case "education":
      return `${item.degree} @ ${item.school}`;
    case "skills":
      return String(item.items);
    default:
      return [item.name, item.detail].filter(Boolean).join(" — ");
  }
}

function itemLabel(list: ListKey, item: Record<string, unknown>): string {
  switch (list) {
    case "experience":
      return String(item.company || item.role || "Experience");
    case "projects":
      return `Project ${item.name}`;
    case "education":
      return String(item.school || "Education");
    case "skills":
      return `Skills${item.category ? ` · ${item.category}` : ""}`;
    default:
      return `${list[0].toUpperCase()}${list.slice(1)} · ${item.name}`;
  }
}

export function locate(cv: Cv, id: string): Located | undefined {
  if (id === SUMMARY) return { kind: "field", field: SUMMARY, text: cv.summary, label: "Summary" };
  if (id === HEADLINE) return { kind: "field", field: HEADLINE, text: cv.basics.headline, label: "Headline" };
  for (const list of LISTS) {
    const items = cv[list] as unknown as (Record<string, unknown> & { id: string; hidden: boolean })[];
    const index = items.findIndex((i) => i.id === id);
    if (index >= 0) {
      const item = items[index];
      return {
        kind: "item",
        list,
        index,
        count: items.length,
        text: itemText(list, item),
        hidden: item.hidden,
        label: itemLabel(list, item),
        rewritable: list === "skills" || list === "projects",
      };
    }
    if (list === "experience" || list === "projects") {
      for (const parent of items as unknown as { id: string; bullets: CvBullet[]; company?: string; name?: string }[]) {
        const b = parent.bullets.findIndex((x) => x.id === id);
        if (b >= 0) {
          return {
            kind: "bullet",
            bullet: parent.bullets[b],
            siblings: parent.bullets.length,
            parentId: parent.id,
            label: `${parent.company ?? `Project ${parent.name}`} · bullet ${b + 1}`,
          };
        }
      }
    }
  }
  return undefined;
}

/** Lowercased text of the whole CV, used to check rewrites don't introduce new facts. */
export function cvVocabulary(cv: Cv): string {
  // Leave out ids and flags: random ids contain digits that would make invented numbers look "known".
  return JSON.stringify(cv, (k, v) => (k === "id" || k === "hidden" || k === "language" ? undefined : v)).toLowerCase();
}

const numbersIn = (s: string) => s.match(/\d+(?:[.,]\d+)?/g) ?? [];

// Longest text accepted for one added bullet or project description (~2 printed lines).
const MAX_ADDED_TEXT = 260;

/** Printed lines an add/addProject suggestion would put on the page. */
export function addedLines(s: Suggestion): number {
  if (s.op === "add") return estimateLines(s.text);
  if (s.op === "addProject") return 2 + s.bullets.reduce((n, b) => n + estimateLines(b), 0);
  return 0;
}

/** Capitalised / technical-looking terms (AWS, Terraform, CI/CD, K8s) not found anywhere in the CV. */
export function unknownTerms(text: string, vocabulary: string, allowed = ""): string[] {
  const extra = allowed.toLowerCase();
  const terms = new Set<string>();
  for (const sentence of text.split(/(?<=[.!?:;])\s+|\n/)) {
    const words = sentence.match(/[\p{L}\p{N}][\p{L}\p{N}+#./-]*[\p{L}\p{N}+#]|[\p{L}\p{N}]/gu) ?? [];
    words.forEach((w, i) => {
      const technical = /\d|[+#/]/.test(w) || (/^\p{Lu}/u.test(w) && i > 0) || /^\p{Lu}{2,}$/u.test(w);
      const lower = w.toLowerCase();
      if (technical && w.length > 1 && !vocabulary.includes(lower) && !extra.includes(lower)) terms.add(w);
    });
  }
  return [...terms];
}

/**
 * Checks the model's operations against the CV and the candidate's experience notes. Returns the usable ones and
 * why the rest were dropped.
 */
export function validateOperations(
  cv: Cv,
  raw: unknown[],
  jobTitle = "",
  notes = "",
): { suggestions: Suggestion[]; rejected: Rejected[] } {
  const notesText = notes.toLowerCase();
  // Facts may come from the CV or the notes.
  const vocabulary = `${cvVocabulary(cv)}\n${notesText}`;
  const suggestions: Suggestion[] = [];
  const rejected: Rejected[] = [];
  const seen = new Set<string>();
  const moves: Extract<ModelOperation, { op: "move" }>[] = [];

  for (const candidate of raw) {
    const parsed = operationSchema.safeParse(candidate);
    if (!parsed.success) {
      rejected.push({ op: candidate, why: "malformed operation" });
      continue;
    }
    const op = parsed.data;

    if (op.op === "addProject") {
      const name = op.name.trim();
      const texts = [op.description, ...op.bullets].map((t) => t.trim()).filter(Boolean);
      const key = `addProject:${name.toLowerCase()}`;
      if (!notesText) {
        rejected.push({ op, why: "new projects need experience notes to come from" });
      } else if (!name || texts.length === 0) {
        rejected.push({ op, why: "new project needs a name and a description or bullets" });
      } else if (seen.has(key) || cv.projects.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
        rejected.push({ op, why: `project ${name} is already on the CV` });
      } else if (texts.some((t) => t.length > MAX_ADDED_TEXT) || op.bullets.length > 3) {
        rejected.push({ op, why: "new project is too long" });
      } else if (texts.flatMap(numbersIn).some((n) => !notesText.includes(n))) {
        rejected.push({ op, why: `introduces numbers not in your notes: ${texts.flatMap(numbersIn).filter((n) => !notesText.includes(n)).join(", ")}` });
      } else {
        seen.add(key);
        suggestions.push({
          ...op,
          name,
          description: op.description.trim(),
          bullets: op.bullets.map((b) => b.trim()).filter(Boolean),
          key,
          target: `New project · ${name}`,
          before: "",
          warnings: unknownTerms(`${name}\n${texts.join("\n")}`, vocabulary),
        });
      }
      continue;
    }

    const where = locate(cv, op.id);
    if (op.op === "add") {
      const text = op.text.trim();
      const parent = where?.kind === "item" && (where.list === "experience" || where.list === "projects") ? where : undefined;
      // The entry's own text counts as a source for numbers too (e.g. a team size already on the CV).
      const sources = `${notesText}\n${parent ? JSON.stringify(cv[parent.list][parent.index]).toLowerCase() : ""}`;
      const invented = numbersIn(text).filter((n) => !sources.includes(n));
      if (!notesText) rejected.push({ op, why: "new bullets need experience notes to come from" });
      else if (!parent) rejected.push({ op, why: `bullets can only be added to a job or project, not ${op.id}` });
      else if (!text) continue;
      else if (text.length > MAX_ADDED_TEXT) rejected.push({ op, why: "new bullet is too long" });
      else if (invented.length) rejected.push({ op, why: `introduces numbers not in your notes: ${invented.join(", ")}` });
      else {
        const key = `add:${op.id}:${text.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        suggestions.push({
          ...op,
          text,
          key,
          target: `${parent.label} · new bullet`,
          before: "",
          warnings: unknownTerms(text, vocabulary),
          parentId: op.id,
        });
      }
      continue;
    }

    const key = `${op.op}:${op.id}`;
    if (seen.has(key)) continue;
    if (!where) {
      rejected.push({ op, why: `unknown id ${op.id}` });
      continue;
    }

    const before =
      where.kind === "bullet" ? where.bullet.text : where.text;
    let warnings: string[] = [];

    if (op.op === "hide" || op.op === "show") {
      if (where.kind === "field") {
        rejected.push({ op, why: "summary and headline can't be hidden" });
        continue;
      }
      const hidden = where.kind === "bullet" ? where.bullet.hidden : where.hidden;
      if (hidden === (op.op === "hide")) continue; // already in that state
    }

    if (op.op === "move") {
      const count = where.kind === "bullet" ? where.siblings : where.kind === "item" ? where.count : 0;
      if (where.kind === "field" || op.position < 0 || op.position >= count) {
        rejected.push({ op, why: "invalid position" });
        continue;
      }
      seen.add(key);
      moves.push(op);
      continue;
    }

    if (op.op === "rewrite") {
      const text = op.text.trim();
      if (!text || text === before.trim()) continue;
      if (where.kind === "item" && !where.rewritable) {
        rejected.push({ op, why: `${where.list} entries can't be rewritten` });
        continue;
      }
      if (text.length > before.length * 2.5 + 120) {
        rejected.push({ op, why: "rewrite is much longer than the original" });
        continue;
      }
      // Numbers are facts: a rewrite may only use numbers from the original or the notes (for the summary, the CV).
      const source = where.kind === "field" && where.field === SUMMARY ? vocabulary : `${before}\n${notesText}`;
      const invented = numbersIn(text).filter((n) => !source.includes(n));
      if (invented.length) {
        rejected.push({ op, why: `introduces numbers not in your CV: ${invented.join(", ")}` });
        continue;
      }
      // Skills must already be somewhere in the CV or the notes.
      if (where.kind === "item" && where.list === "skills") {
        const newSkills = text
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && !vocabulary.includes(s.toLowerCase()));
        if (newSkills.length) {
          rejected.push({ op, why: `adds skills not in your CV or notes: ${newSkills.join(", ")}` });
          continue;
        }
      }
      // The headline may borrow the job title; other new technical terms get flagged.
      warnings = unknownTerms(text, vocabulary, where.kind === "field" && where.field === HEADLINE ? jobTitle : "");
      op.text = text;
    }

    seen.add(key);
    suggestions.push({
      ...op,
      key,
      target: where.label,
      before,
      warnings,
      ...(where.kind === "bullet" && { parentId: where.parentId }),
    });
  }
  return { suggestions: [...mergeMoves(cv, moves), ...keepOneBulletEach(cv, suggestions, rejected)], rejected };
}

/** A job or project with every bullet hidden looks broken; keep its first bullet. */
function keepOneBulletEach(cv: Cv, suggestions: Suggestion[], rejected: Rejected[]): Suggestion[] {
  const hiddenBy = new Map<string, Set<string>>();
  for (const s of suggestions) {
    if (s.op === "hide" && s.parentId) hiddenBy.set(s.parentId, (hiddenBy.get(s.parentId) ?? new Set()).add(s.id));
  }
  const keep = new Set<string>();
  for (const parent of [...cv.experience, ...cv.projects]) {
    const hides = hiddenBy.get(parent.id);
    const visible = parent.bullets.filter((b) => !b.hidden);
    if (hides && visible.length > 0 && visible.every((b) => hides.has(b.id))) keep.add(visible[0].id);
  }
  return suggestions.filter((s) => {
    if (s.op === "hide" && keep.has(s.id)) {
      rejected.push({ op: s, why: "would hide every bullet of an entry" });
      return false;
    }
    return true;
  });
}

/**
 * Applies the model's moves in order on a copy, then reports one "reorder" per job/project
 * (bullets) or section (entries) whose order actually changed. No-op moves disappear.
 */
function mergeMoves(cv: Cv, moves: Extract<ModelOperation, { op: "move" }>[]): Suggestion[] {
  if (moves.length === 0) return [];
  const reasons = new Map<string, string[]>();
  let sim = cv;
  for (const m of moves) {
    const parent = parentOf(sim, m.id);
    if (!parent) continue;
    sim = applyOperation(sim, m);
    if (m.reason) reasons.set(parent, [...(reasons.get(parent) ?? []), m.reason]);
  }

  const out: Suggestion[] = [];
  const pushIfChanged = (id: string, target: string, before: { id: string; text: string }[], after: { id: string; text: string }[]) => {
    if (before.map((x) => x.id).join() === after.map((x) => x.id).join()) return;
    out.push({
      op: "reorder",
      id,
      order: after.map((x) => x.id),
      reason: (reasons.get(id) ?? []).slice(0, 2).join(" "),
      key: `reorder:${id}`,
      target,
      before: before.map((x) => x.text).join("\n"),
      warnings: [],
      orderPreview: after.map((x) => x.text),
    });
  };

  for (const list of ["experience", "projects"] as const) {
    cv[list].forEach((parent) => {
      const after = sim[list].find((p) => p.id === parent.id)!;
      const name = list === "experience" ? (parent as Cv["experience"][number]).company : `Project ${(parent as Cv["projects"][number]).name}`;
      pushIfChanged(parent.id, `${name} · bullet order`, parent.bullets, after.bullets);
    });
  }
  for (const list of LISTS) {
    const items = (l: Cv) => (l[list] as unknown as Record<string, unknown>[]).map((x) => ({ id: String(x.id), text: itemText(list, x) }));
    pushIfChanged(`list:${list}`, `${list[0].toUpperCase()}${list.slice(1)} · order`, items(cv), items(sim));
  }
  return out;
}

/** The id that groups an item for reordering: its job/project for bullets, "list:<section>" for entries. */
function parentOf(cv: Cv, id: string): string | undefined {
  for (const list of LISTS) {
    const items = cv[list] as unknown as { id: string; bullets?: CvBullet[] }[];
    if (items.some((i) => i.id === id)) return `list:${list}`;
    for (const parent of items) if (parent.bullets?.some((b) => b.id === id)) return parent.id;
  }
  return undefined;
}

function reorder<T extends { id: string }>(items: T[], order: string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}

/** Applies one operation. Unknown ids leave the CV unchanged. */
export function applyOperation(cv: Cv, op: Operation): Cv {
  if (op.op === "reorder") {
    const next = structuredClone(cv);
    if (op.id.startsWith("list:")) {
      const list = op.id.slice(5) as ListKey;
      if (!LISTS.includes(list)) return cv;
      (next[list] as unknown as { id: string }[]) = reorder(next[list] as unknown as { id: string }[], op.order);
      return next;
    }
    for (const list of ["experience", "projects"] as const) {
      const parent = next[list].find((p) => p.id === op.id);
      if (parent) {
        parent.bullets = reorder(parent.bullets, op.order);
        return next;
      }
    }
    return cv;
  }
  if (op.op === "addProject") {
    // Added first: it was picked for being relevant to this job.
    const project = {
      id: newId(),
      name: op.name,
      url: "",
      description: op.description,
      bullets: op.bullets.map((text) => ({ id: newId(), text, hidden: false })),
      hidden: false,
    };
    return { ...cv, projects: [project, ...cv.projects] };
  }
  if (op.id === SUMMARY && op.op === "rewrite") return { ...cv, summary: op.text };
  if (op.id === HEADLINE && op.op === "rewrite") return { ...cv, basics: { ...cv.basics, headline: op.text } };

  const next = structuredClone(cv);
  for (const list of LISTS) {
    const items = next[list] as unknown as (Record<string, unknown> & { id: string; hidden: boolean })[];
    const index = items.findIndex((i) => i.id === op.id);
    if (index >= 0) {
      const item = items[index];
      if (op.op === "add" && (list === "experience" || list === "projects")) {
        (item.bullets as CvBullet[]).push({ id: newId(), text: op.text, hidden: false });
      }
      if (op.op === "hide") item.hidden = true;
      if (op.op === "show") item.hidden = false;
      if (op.op === "move") items.splice(op.position, 0, ...items.splice(index, 1));
      if (op.op === "rewrite") {
        if (list === "skills") item.items = op.text;
        if (list === "projects") item.description = op.text;
      }
      return next;
    }
    if (list === "experience" || list === "projects") {
      for (const parent of items as unknown as { bullets: CvBullet[] }[]) {
        const b = parent.bullets.findIndex((x) => x.id === op.id);
        if (b < 0) continue;
        const bullet = parent.bullets[b];
        if (op.op === "hide") bullet.hidden = true;
        if (op.op === "show") bullet.hidden = false;
        if (op.op === "rewrite") bullet.text = op.text;
        if (op.op === "move") parent.bullets.splice(op.position, 0, ...parent.bullets.splice(b, 1));
        return next;
      }
    }
  }
  return cv;
}

/** Rough printed lines for a text in the CV template (~125 characters per bullet line in 9pt Times). */
export function estimateLines(text: string): number {
  return Math.max(1, Math.ceil(text.length / 125));
}

/** The CV as plain text with ids and line estimates, for the prompt. */
export function cvForPrompt(cv: Cv): string {
  const h = (hidden: boolean) => (hidden ? " (currently hidden)" : "");
  const bl = (text: string, hidden: boolean) => (hidden ? "" : ` [~${estimateLines(text)} lines]`);
  const entryLines = (bullets: CvBullet[]) => 2 + bullets.filter((b) => !b.hidden).reduce((n, b) => n + estimateLines(b.text), 0);
  const lines = [
    `[id=headline] HEADLINE: ${cv.basics.headline}`,
    `[id=summary] SUMMARY: ${cv.summary}`,
    "EXPERIENCE:",
    ...cv.experience.flatMap((e, i) => [
      `  [id=${e.id}] #${i} ${e.role} @ ${e.company}, ${e.location} (${e.start} – ${e.end})${h(e.hidden)}${e.hidden ? "" : ` [entry total ~${entryLines(e.bullets)} lines]`}`,
      ...e.bullets.map((b, j) => `    [id=${b.id}] #${j} ${b.text}${h(b.hidden)}${bl(b.text, b.hidden)}`),
    ]),
    "PROJECTS:",
    ...cv.projects.flatMap((p, i) => [
      `  [id=${p.id}] #${i} ${p.name}: ${p.description}${h(p.hidden)}${p.hidden ? "" : ` [entry total ~${entryLines(p.bullets)} lines]`}`,
      ...p.bullets.map((b, j) => `    [id=${b.id}] #${j} ${b.text}${h(b.hidden)}${bl(b.text, b.hidden)}`),
    ]),
    "EDUCATION:",
    ...cv.education.map((e, i) => `  [id=${e.id}] #${i} ${e.degree} @ ${e.school} (${e.start} – ${e.end})${h(e.hidden)}`),
    "SKILLS:",
    ...cv.skills.map((s, i) => `  [id=${s.id}] #${i} ${s.category}: ${s.items}${h(s.hidden)}`),
    "CERTIFICATIONS:",
    ...cv.certifications.map((c, i) => `  [id=${c.id}] #${i} ${c.name} ${c.detail}${h(c.hidden)}`),
    "LANGUAGES:",
    ...cv.languages.map((l, i) => `  [id=${l.id}] #${i} ${l.name} ${l.detail}${h(l.hidden)}`),
    "INTERESTS:",
    ...cv.interests.map((l, i) => `  [id=${l.id}] #${i} ${l.name}${h(l.hidden)}`),
  ];
  return lines.join("\n");
}

export type Relevance = { score: number; why: string };

/**
 * Picks what to hide so the CV loses about `linesNeeded` printed lines, least relevant first:
 *   1. bullets of older jobs and projects, keeping at least one per entry;
 *   2. bullets of the current (first) job, keeping its best three;
 *   3. whole projects (never jobs: that would leave a gap in the timeline).
 */
export function planLengthHides(cv: Cv, relevance: Map<string, Relevance>, linesNeeded: number): Operation[] {
  if (linesNeeded <= 0) return [];
  const ops: Operation[] = [];
  const hidden = new Set<string>();
  let removed = 0;
  const score = (id: string) => relevance.get(id)?.score ?? 5;
  const reason = (id: string) => {
    const why = relevance.get(id)?.why;
    return `To fit one page: least relevant here (${score(id)}/10)${why ? ` — ${why}` : ""}`;
  };

  const trimBullets = (entries: { id: string; bullets: CvBullet[] }[], keep: number) => {
    const remaining = new Map<string, number>();
    const candidates: { id: string; parent: string; lines: number; position: number }[] = [];
    for (const entry of entries) {
      const visible = entry.bullets.filter((b) => !b.hidden && !hidden.has(b.id));
      remaining.set(entry.id, visible.length);
      visible.forEach((b, position) =>
        candidates.push({ id: b.id, parent: entry.id, lines: estimateLines(b.text), position }),
      );
    }
    // Least relevant first; among equals, bullets lower down their entry go first.
    candidates.sort((a, b) => score(a.id) - score(b.id) || b.position - a.position);
    for (const c of candidates) {
      if (removed >= linesNeeded) return;
      if ((remaining.get(c.parent) ?? 0) <= keep) continue;
      remaining.set(c.parent, remaining.get(c.parent)! - 1);
      removed += c.lines;
      hidden.add(c.id);
      ops.push({ op: "hide", id: c.id, reason: reason(c.id) });
    }
  };

  const [current, ...older] = cv.experience.filter((e) => !e.hidden);
  const projects = cv.projects.filter((p) => !p.hidden);
  trimBullets([...older, ...projects], 1);
  if (current) trimBullets([current], 3);

  // Whole projects, lowest average bullet relevance first.
  const avg = (p: (typeof projects)[number]) =>
    p.bullets.length ? p.bullets.reduce((n, b) => n + score(b.id), 0) / p.bullets.length : 0;
  for (const p of [...projects].sort((a, b) => avg(a) - avg(b))) {
    if (removed >= linesNeeded) break;
    const stillVisible = p.bullets.filter((b) => !b.hidden && !hidden.has(b.id));
    removed += 2 + stillVisible.reduce((n, b) => n + estimateLines(b.text), 0);
    // Hiding the project covers its bullets; drop now-redundant bullet hides.
    for (let i = ops.length - 1; i >= 0; i--) if (p.bullets.some((b) => b.id === ops[i].id)) ops.splice(i, 1);
    ops.push({ op: "hide", id: p.id, reason: `To fit one page: least relevant project here (avg ${avg(p).toFixed(1)}/10)` });
  }
  return ops;
}
