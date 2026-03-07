import { describe, expect, it } from "vitest";
import {
  extractDomainKeywordsFromPrompt,
  keywordAppearsInText,
  normalizeDomainKeywords,
} from "./domainKeywords.js";

describe("domain keyword normalization", () => {
  it("dedupes, removes stopwords, and caps size", () => {
    const out = normalizeDomainKeywords(
      [
        "Analytics",
        "analytics",
        "the",
        "portfolio management",
        "portfolio management",
        "risk",
        "compliance",
      ],
      { max: 3 },
    );

    expect(out).toEqual(["analytics", "portfolio management", "risk"]);
  });

  it("extracts stable domain keywords from prompt text", () => {
    const out = extractDomainKeywordsFromPrompt(
      "Build a budgeting and expense tracker with monthly spending alerts and category reports.",
      { max: 6 },
    );

    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("budgeting");
  });
});

describe("boundary-safe keyword matching", () => {
  it("does not match substring collisions", () => {
    expect(keywordAppearsInText("planetary motion", "plan")).toBe(false);
    expect(keywordAppearsInText("project plan", "plan")).toBe(true);
  });

  it("matches phrase tokens with whitespace boundaries", () => {
    expect(keywordAppearsInText("macro nutrient tracking", "macro nutrient")).toBe(true);
    expect(keywordAppearsInText("macronutrient tracking", "macro nutrient")).toBe(false);
  });
});
