import { describe, expect, it } from "vitest";
import { inventedNumbers, unknownTerms } from "./facts";

describe("unknownTerms", () => {
  it("ignores sentence-initial capitals and known terms", () => {
    expect(unknownTerms("Déploiement sur AWS avec Terraform et Ansible.", "aws terraform")).toEqual(["Ansible"]);
  });

  it("flags slash terms only when they hold a name", () => {
    expect(unknownTerms("Pause/reprise des environnements et sondes liveness/readiness, avec TCP/IP.", "")).toEqual(["TCP/IP"]);
  });
});

describe("inventedNumbers", () => {
  it("flags numbers the source doesn't hold on their own", () => {
    expect(inventedNumbers("J'ai géré 16 clusters en 2016.", "Depuis 2016")).toEqual(["16"]);
  });

  it("accepts small numbers spelled out in the source", () => {
    expect(inventedNumbers("En 5 minutes.", "in about five minutes")).toEqual([]);
  });
});
