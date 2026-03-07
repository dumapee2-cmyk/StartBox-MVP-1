import { describe, expect, it } from "vitest";
import { buildReasonerSystemPrompt, buildReasonerUserPrompt } from "./reasonerPrompt.js";
import { buildResearchSystemPrompt } from "./designPrompt.js";
import { buildCodegenSystemPrompt, buildRepairSystemPrompt } from "./codegenPrompt.js";

describe("prompt builders", () => {
  it("exclude banned hardcoded forcing phrases", () => {
    const promptBlob = [
      buildReasonerSystemPrompt(),
      buildReasonerUserPrompt("build a finance dashboard"),
      buildResearchSystemPrompt(),
      buildCodegenSystemPrompt("light"),
      buildRepairSystemPrompt(),
    ]
      .join("\n")
      .toLowerCase();

    expect(promptBlob).not.toContain("use these exact items");
    expect(promptBlob).not.toContain("fixed hero slogan");
  });

  it("uses only --sb-* token contract text and no --color-* token contract text", () => {
    const promptBlob = [
      buildReasonerSystemPrompt(),
      buildCodegenSystemPrompt("dark"),
      buildRepairSystemPrompt(),
    ]
      .join("\n")
      .toLowerCase();

    expect(promptBlob).toContain("--sb-");
    expect(promptBlob).not.toContain("--color-");
  });
});
