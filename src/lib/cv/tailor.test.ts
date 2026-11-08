import { describe, expect, it } from "vitest";
import { cvSchema } from "./schema";
import { applyOperation, planLengthHides, type Relevance, unknownTerms, validateOperations } from "./tailor";

const cv = cvSchema.parse({
  basics: { name: "Joe", headline: "Ingénieur Cloud / DevOps" },
  summary: "3 ans d'expérience sur AWS et Kubernetes.",
  experience: [
    {
      id: "e1",
      company: "Faradae",
      role: "Ingénieur Cloud",
      bullets: [
        { id: "b1", text: "CI/CD GitHub Actions pour plus de 100 services Cloud Run." },
        { id: "b2", text: "Migration de l'infrastructure GCP vers Terraform." },
        { id: "b3", text: "Logging structuré et alertes sur Google Chat." },
      ],
    },
    { id: "e2", company: "Oreyeon", role: "Front-end", bullets: [{ id: "b4", text: "Plateforme interne Next.js." }] },
  ],
  skills: [{ id: "s1", category: "Techniques", items: "Kubernetes, AWS, Terraform, Python, React" }],
});

describe("validateOperations", () => {
  it("keeps valid operations with labels and before-text", () => {
    const { suggestions, rejected } = validateOperations(cv, [
      { op: "hide", id: "e2", reason: "front-end role, not relevant" },
      { op: "move", id: "b2", position: 0, reason: "Terraform first" },
      { op: "rewrite", id: "b3", text: "Observabilité : logging structuré et alertes sur Google Chat.", reason: "keyword" },
    ]);
    expect(rejected).toEqual([]);
    expect(suggestions.map((s) => [s.op, s.target])).toEqual([
      ["reorder", "Faradae · bullet order"],
      ["hide", "Oreyeon"],
      ["rewrite", "Faradae · bullet 3"],
    ]);
    expect(suggestions[0].op === "reorder" && suggestions[0].order).toEqual(["b2", "b1", "b3"]);
    expect(suggestions[2].before).toBe("Logging structuré et alertes sur Google Chat.");
  });

  it("merges a series of moves into one reorder per parent and drops no-op moves", () => {
    const { suggestions } = validateOperations(cv, [
      { op: "move", id: "b3", position: 0 },
      { op: "move", id: "b1", position: 1 },
      { op: "move", id: "b4", position: 0 },
      { op: "move", id: "e2", position: 0 },
    ]);
    expect(suggestions.map((s) => [s.op, s.id, s.op === "reorder" ? s.order : null])).toEqual([
      ["reorder", "e1", ["b3", "b1", "b2"]],
      ["reorder", "list:experience", ["e2", "e1"]],
    ]);
    const applied = suggestions.reduce((acc, s) => applyOperation(acc, s), cv);
    expect(applied.experience.map((e) => e.id)).toEqual(["e2", "e1"]);
    expect(applied.experience[1].bullets.map((b) => b.id)).toEqual(["b3", "b1", "b2"]);
  });

  it("rejects unknown ids, invented numbers, invented skills and bad positions", () => {
    const { suggestions, rejected } = validateOperations(cv, [
      { op: "hide", id: "nope" },
      { op: "rewrite", id: "b1", text: "CI/CD GitHub Actions pour 250 services, -40 % de temps de build." },
      { op: "rewrite", id: "s1", text: "Kubernetes, AWS, Azure, Terraform" },
      { op: "move", id: "b1", position: 7 },
      { op: "rewrite", id: "e1", text: "Lead Engineer" },
      { op: "explode", id: "b1" },
    ]);
    expect(suggestions).toEqual([]);
    expect(rejected.map((r) => r.why)).toEqual([
      "unknown id nope",
      "introduces numbers not in your CV: 250, 40",
      "adds skills not in your CV or notes: Azure",
      "invalid position",
      "experience entries can't be rewritten",
      "malformed operation",
    ]);
  });

  it("doesn't treat digits inside item ids as known numbers", () => {
    const withDigitIds = cvSchema.parse({ ...cv, experience: [{ ...cv.experience[0], id: "x5y7" }] });
    const { rejected } = validateOperations(withDigitIds, [
      { op: "rewrite", id: "summary", text: "5 ans d'expérience sur AWS et Kubernetes." },
    ]);
    expect(rejected.map((r) => r.why)).toEqual(["introduces numbers not in your CV: 5"]);
  });

  it("flags new technical terms but lets the headline borrow the job title", () => {
    const { suggestions } = validateOperations(
      cv,
      [
        { op: "rewrite", id: "b2", text: "Migration de l'infrastructure GCP vers Terraform et Pulumi." },
        { op: "rewrite", id: "headline", text: "Site Reliability Engineer" },
      ],
      "Site Reliability Engineer",
    );
    expect(suggestions[0].warnings).toEqual(["Pulumi"]);
    expect(suggestions[1].warnings).toEqual([]);
  });

  it("skips no-op operations (hiding something hidden, rewrite to same text)", () => {
    const hiddenCv = applyOperation(cv, { op: "hide", id: "b4", reason: "" });
    const { suggestions } = validateOperations(hiddenCv, [
      { op: "hide", id: "b4" },
      { op: "rewrite", id: "b2", text: "Migration de l'infrastructure GCP vers Terraform." },
    ]);
    expect(suggestions).toEqual([]);
  });

  it("keeps at least one bullet visible per entry", () => {
    const { suggestions, rejected } = validateOperations(cv, [
      { op: "hide", id: "b1" },
      { op: "hide", id: "b2" },
      { op: "hide", id: "b3" },
    ]);
    expect(suggestions.map((s) => s.id)).toEqual(["b2", "b3"]);
    expect(rejected.map((r) => r.why)).toEqual(["would hide every bullet of an entry"]);
  });
});

describe("applyOperation", () => {
  it("hides, moves and rewrites without mutating the input", () => {
    let next = applyOperation(cv, { op: "move", id: "b3", position: 0, reason: "" });
    next = applyOperation(next, { op: "hide", id: "e2", reason: "" });
    next = applyOperation(next, { op: "rewrite", id: "summary", text: "Nouveau résumé.", reason: "" });
    next = applyOperation(next, { op: "rewrite", id: "s1", text: "Kubernetes, Terraform, AWS", reason: "" });
    expect(next.experience[0].bullets.map((b) => b.id)).toEqual(["b3", "b1", "b2"]);
    expect(next.experience[1].hidden).toBe(true);
    expect(next.summary).toBe("Nouveau résumé.");
    expect(next.skills[0].items).toBe("Kubernetes, Terraform, AWS");
    expect(cv.experience[0].bullets[0].id).toBe("b1");
    expect(cv.experience[1].hidden).toBe(false);
  });
});

describe("unknownTerms", () => {
  it("ignores sentence-initial capitals and known terms", () => {
    expect(unknownTerms("Déploiement sur AWS avec Terraform et Ansible.", "aws terraform")).toEqual(["Ansible"]);
  });
});

describe("planLengthHides", () => {
  const long = (n: number) => "x".repeat(n);
  const big = cvSchema.parse({
    basics: {},
    experience: [
      { id: "cur", bullets: [{ id: "c1", text: long(100) }, { id: "c2", text: long(100) }] },
      { id: "old", bullets: [{ id: "o1", text: long(200) }, { id: "o2", text: long(100) }, { id: "o3", text: long(100) }] },
    ],
    projects: [{ id: "p", bullets: [{ id: "p1", text: long(100) }, { id: "p2", text: long(100) }] }],
  });
  const rel = (pairs: [string, number][]) => new Map<string, Relevance>(pairs.map(([id, score]) => [id, { score, why: "" }]));

  it("hides least relevant bullets until enough lines are freed", () => {
    const ops = planLengthHides(big, rel([["o1", 1], ["o2", 6], ["o3", 3], ["p1", 2], ["p2", 9]]), 3);
    expect(ops.map((o) => o.id)).toEqual(["o1", "p1"]); // 2 lines + 1 line, least relevant first
  });

  it("keeps the current job's best 3 and one bullet per job, then hides whole projects", () => {
    const ops = planLengthHides(big, rel([["c1", 0], ["c2", 0], ["o1", 1], ["o2", 1], ["o3", 1], ["p1", 1], ["p2", 1]]), 100);
    const ids = ops.map((o) => o.id);
    expect(ids).not.toContain("c1"); // current job has only 2 bullets (< 3)
    expect(ids).not.toContain("c2");
    expect(ids.filter((id) => id.startsWith("o"))).toHaveLength(2); // one of 3 stays
    expect(ids).toContain("p"); // project hidden as a whole…
    expect(ids).not.toContain("p1"); // …replacing its individual bullet hides
  });

  it("does nothing when the CV already fits", () => {
    expect(planLengthHides(big, rel([]), 0)).toEqual([]);
  });
});

describe("additions from experience notes", () => {
  const notes =
    "Faradae: built a cost dashboard in BigQuery that cut GCP spend by 18 %. Side project Homelab: k3s cluster with Cilium and Falco.";

  it("adds bullets and projects backed by the notes", () => {
    const { suggestions, rejected } = validateOperations(
      cv,
      [
        { op: "add", id: "e1", text: "Dashboard de coûts BigQuery : -18 % sur la facture GCP." },
        { op: "addProject", name: "Homelab", description: "Cluster k3s avec Cilium et Falco." },
      ],
      "",
      notes,
    );
    expect(rejected).toEqual([]);
    expect(suggestions.map((s) => [s.op, s.target, s.warnings])).toEqual([
      ["add", "Faradae · new bullet", []],
      ["addProject", "New project · Homelab", []],
    ]);
    const applied = suggestions.reduce((acc, s) => applyOperation(acc, s), cv);
    expect(applied.experience[0].bullets.at(-1)?.text).toBe("Dashboard de coûts BigQuery : -18 % sur la facture GCP.");
    expect(applied.projects[0]).toMatchObject({ name: "Homelab", description: "Cluster k3s avec Cilium et Falco.", hidden: false });
    expect(cv.projects).toEqual([]);
  });

  it("rejects additions without notes, with invented numbers, or on the wrong target", () => {
    expect(validateOperations(cv, [{ op: "add", id: "e1", text: "Dashboard BigQuery." }]).rejected[0].why).toMatch(
      /need experience notes/,
    );
    const { suggestions, rejected } = validateOperations(
      cv,
      [
        { op: "add", id: "e1", text: "Dashboard BigQuery : -25 % sur la facture GCP." },
        { op: "add", id: "b1", text: "Dashboard BigQuery." },
        { op: "addProject", name: "Homelab", description: "Cluster de 12 nœuds k3s." },
      ],
      "",
      notes,
    );
    expect(suggestions).toEqual([]);
    expect(rejected.map((r) => r.why)).toEqual([
      "introduces numbers not in your notes: 25",
      "bullets can only be added to a job or project, not b1",
      "introduces numbers not in your notes: 12",
    ]);
  });

  it("lets rewrites and skills use facts from the notes", () => {
    const { suggestions, rejected } = validateOperations(
      cv,
      [
        { op: "rewrite", id: "b2", text: "Migration de l'infrastructure GCP vers Terraform, -18 % de coûts." },
        { op: "rewrite", id: "s1", text: "Kubernetes, Cilium, Falco, Terraform" },
      ],
      "",
      notes,
    );
    expect(rejected).toEqual([]);
    expect(suggestions.map((s) => s.warnings)).toEqual([[], []]);
  });
});
