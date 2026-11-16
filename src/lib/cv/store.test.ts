import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { cvSchema } from "./schema";
import { getCv, getMasterCv, masterLanguages, parseTarget, pickMasterCv, saveCv } from "./store";

const cv = (name: string, language: "en" | "fr") => cvSchema.parse({ language, basics: { name } });

describe("master CVs per language", () => {
  let db: Db;
  beforeEach(() => {
    db = createDb(":memory:");
  });

  it("parses master and job targets", () => {
    expect(parseTarget("master-fr")).toBe("master-fr");
    expect(parseTarget("master-en")).toBe("master-en");
    expect(parseTarget("master")).toBeNull();
    expect(parseTarget("master-de")).toBeNull();
    expect(parseTarget("12")).toBe(12);
  });

  it("stores each language separately and keeps a master's language in line with its slot", () => {
    saveCv(db, "master-fr", cv("Joe FR", "fr"));
    saveCv(db, "master-en", cv("Joe EN", "fr"));
    expect(getMasterCv(db, "fr")?.basics.name).toBe("Joe FR");
    expect(getCv(db, "master-en")).toMatchObject({ language: "en", basics: { name: "Joe EN" } });
    expect(masterLanguages(db)).toEqual(["fr", "en"]);
  });

  it("falls back to the other language when the preferred one has no master", () => {
    expect(pickMasterCv(db, "en")).toBeUndefined();
    saveCv(db, "master-fr", cv("Joe FR", "fr"));
    expect(pickMasterCv(db, "en")?.language).toBe("fr");
    expect(pickMasterCv(db)?.language).toBe("fr");
    saveCv(db, "master-en", cv("Joe EN", "en"));
    expect(pickMasterCv(db, "en")?.language).toBe("en");
  });
});
