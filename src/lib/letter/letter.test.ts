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
  const vocabulary = {
    own: "ingénieur devops, 7 certifications aws, kubernetes, terraform, 75 % des services, epita, 2027",
    posting: "nous cherchons un devops avec 3 ans d'expérience sur eks et gitlab.",
  };

  it("passes a letter that only uses known facts", () => {
    expect(
      letterWarnings("Madame, Monsieur,\n\nAvec 7 certifications AWS, j'ai migré 75 % des services sur Kubernetes.", vocabulary),
    ).toEqual({ unknown: [], fromPosting: [] });
  });

  it("flags invented numbers and unknown technical terms", () => {
    expect(letterWarnings("J'ai réduit les coûts de 40 % avec Pulumi et Terraform.", vocabulary).unknown).toEqual([
      "the number 40",
      "Pulumi",
    ]);
  });

  it("doesn't let part of a longer number back a shorter one", () => {
    expect(letterWarnings("J'ai géré 20 clusters Kubernetes.", vocabulary).unknown).toEqual(["the number 20"]);
  });

  it("separates terms that only the posting uses", () => {
    expect(letterWarnings("J'ai géré des clusters EKS avec Terraform pendant 3 ans.", vocabulary)).toEqual({
      unknown: [],
      fromPosting: ["EKS"],
    });
  });
});

describe("fixSignOff", () => {
  it("replaces a wrong-language sign-off and adds a missing one", async () => {
    const { fixSignOff } = await import("@/lib/ai/write-letter");
    expect(fixSignOff("Dear Hiring Team,\n\nBody.\n\nCordialement,", "en")).toBe("Dear Hiring Team,\n\nBody.\n\nKind regards,");
    expect(fixSignOff("Madame, Monsieur,\n\nCorps.", "fr")).toBe("Madame, Monsieur,\n\nCorps.\n\nCordialement,");
  });
});
