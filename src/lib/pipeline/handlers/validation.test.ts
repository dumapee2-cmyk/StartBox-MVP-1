import { describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "../types.js";

vi.mock("../../qualityScorer.js", () => ({
  scoreFactoryDimensions: vi.fn(),
}));

import { scoreFactoryDimensions } from "../../qualityScorer.js";
import { handleValidation } from "./validation.js";

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    runId: "run-validation",
    prompt: "build a nutrition app",
    model: "kimi",
    state: "VALIDATING",
    stateHistory: [],
    contextBrief: null,
    competitorVisuals: null,
    intent: null,
    spec: null,
    contentMap: null,
    generatedCode: "const App = () => <div/>;",
    appName: null,
    tagline: null,
    themeColor: null,
    pages: [],
    qualityScore: 70,
    qualityBreakdown: {
      layout_diversity: 70,
      visual_uniqueness: 70,
      domain_specificity: 70,
      navigation_correctness: 70,
      interaction_richness: 70,
      visual_richness: 70,
      form_styling: 70,
      content_layout_fit: 70,
    },
    pipelineArtifact: null,
    pipelineSummary: null,
    degraded: false,
    repairCount: 0,
    maxRepairs: 2,
    errors: [],
    onProgress: undefined,
    signal: undefined,
    result: null,
    ...overrides,
  };
}

describe("v1 validation fatal factory gates", () => {
  it("routes to repair when fatal issues exist and repairs remain", async () => {
    vi.mocked(scoreFactoryDimensions).mockReturnValue({
      code_quality: 85,
      design_quality: 80,
      security: 90,
      performance: 80,
      overall: 84,
      issues: ["FATAL: unresolved icon/component refs (ArrowLeft)"],
    });

    const ctx = makeCtx({ repairCount: 0, maxRepairs: 2 });
    const out = await handleValidation(ctx);

    expect(out.nextState).toBe("REPAIRING");
    expect(ctx.latestFactoryIssues).toEqual(["FATAL: unresolved icon/component refs (ArrowLeft)"]);
  });

  it("fails when fatal issues persist after max repairs", async () => {
    vi.mocked(scoreFactoryDimensions).mockReturnValue({
      code_quality: 60,
      design_quality: 60,
      security: 60,
      performance: 60,
      overall: 60,
      issues: ["FATAL: overlapping SVG center text labels detected"],
    });

    const ctx = makeCtx({ repairCount: 2, maxRepairs: 2 });
    const out = await handleValidation(ctx);

    expect(out.nextState).toBe("FAILED");
    expect(ctx.errors.some((e) => e.message.includes("Fatal validation checks failed after max repairs"))).toBe(true);
  });
});
