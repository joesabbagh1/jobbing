import { describe, expect, it } from "vitest";
import { cvSchema, EMPTY_CV } from "./schema";

describe("cvSchema", () => {
  it("fills defaults for missing fields", () => {
    const cv = cvSchema.parse({ basics: { name: "Jane" }, experience: [{ id: "e1", bullets: [{ id: "b1" }] }] });
    expect(cv.language).toBe("en");
    expect(cv.basics.email).toBe("");
    expect(cv.experience[0]).toMatchObject({ company: "", hidden: false, bullets: [{ id: "b1", text: "", hidden: false }] });
    expect(cv.skills).toEqual([]);
  });

  it("rejects items without ids, since tailoring refers to them", () => {
    expect(() => cvSchema.parse({ basics: {}, experience: [{ company: "Acme" }] })).toThrow();
  });

  it("has a valid empty CV", () => {
    expect(cvSchema.parse(EMPTY_CV)).toEqual(EMPTY_CV);
  });
});
