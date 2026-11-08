import { describe, expect, it } from "vitest";
import { letterWarnings } from "./check";
import { detectLanguage } from "./schema";

describe("detectLanguage", () => {
  it("tells French and English postings apart", () => {
    expect(detectLanguage("Vous rejoindrez une équipe pour le déploiement de la plateforme avec nous.")).toBe("fr");
    expect(detectLanguage("You will join the platform team and work with our engineers on the role.")).toBe("en");
  });
});

describe("letterWarnings", () => {
  const vocabulary = "ingénieur devops, 7 certifications aws, kubernetes, terraform, 75 % des services, epita".toLowerCase();

  it("passes a letter that only uses known facts", () => {
    expect(letterWarnings("Madame, Monsieur,\n\nAvec 7 certifications AWS, j'ai migré 75 % des services sur Kubernetes.", vocabulary)).toEqual([]);
  });

  it("flags invented numbers and unknown technical terms", () => {
    expect(letterWarnings("J'ai réduit les coûts de 40 % avec Pulumi et Terraform.", vocabulary)).toEqual([
      "the number 40",
      "Pulumi",
    ]);
  });
});

describe("fixSignOff", () => {
  it("replaces a wrong-language sign-off and adds a missing one", async () => {
    const { fixSignOff } = await import("@/lib/ai/write-letter");
    expect(fixSignOff("Dear Hiring Team,\n\nBody.\n\nCordialement,", "en")).toBe("Dear Hiring Team,\n\nBody.\n\nKind regards,");
    expect(fixSignOff("Madame, Monsieur,\n\nCorps.", "fr")).toBe("Madame, Monsieur,\n\nCorps.\n\nCordialement,");
  });
});
