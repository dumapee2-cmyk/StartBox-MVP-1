import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "../types.js";
import type { QualityBreakdown } from "../../../types/index.js";

vi.mock("./fixAgents.js", () => ({
  runAllFixAgents: vi.fn(),
}));

vi.mock("../../qualityScorer.js", () => ({
  scoreGeneratedCode: vi.fn(),
  scoreFactoryDimensions: vi.fn(),
  generateRetryFeedback: vi.fn(() => "fix issues"),
}));

vi.mock("../../codeGenerator.js", () => ({
  repairGeneratedCode: vi.fn(),
}));

vi.mock("../../modelResolver.js", () => ({
  resolveModel: vi.fn(() => "kimi-k2.5"),
}));

import { runAllFixAgents } from "./fixAgents.js";
import { generateRetryFeedback, scoreFactoryDimensions, scoreGeneratedCode } from "../../qualityScorer.js";
import { repairGeneratedCode } from "../../codeGenerator.js";
import { handleRepair } from "./repair.js";

const improvedBreakdown: QualityBreakdown = {
  layout_diversity: 70,
  visual_uniqueness: 70,
  domain_specificity: 75,
  navigation_correctness: 70,
  interaction_richness: 72,
  visual_richness: 68,
  form_styling: 66,
  content_layout_fit: 70,
};

function makeCtx(): PipelineContext {
  return {
    runId: "run-repair",
    prompt: "build a tracker",
    model: "kimi",
    state: "REPAIRING",
    stateHistory: [],
    contextBrief: null,
    competitorVisuals: null,
    intent: {
      normalized_prompt: "build a tracker",
      app_name_hint: "Tracker",
      primary_goal: "Track things",
      domain: "productivity",
      design_philosophy: "clean",
      target_user: "teams",
      key_differentiator: "speed",
      visual_style_keywords: ["clean"],
      premium_features: ["tasks"],
      nav_tabs: [
        { id: "home", label: "Home", icon: "Home", layout: "dashboard", purpose: "overview" },
        { id: "tasks", label: "Tasks", icon: "Check", layout: "list", purpose: "task list" },
      ],
      primary_color: "#6366f1",
      theme_style: "light",
      app_icon: "Zap",
      output_format_hint: "cards",
      layout_blueprint: "grid-dashboard",
      animation_keywords: ["smooth"],
      visual_requirements: {
        hero_pattern: "minimal_header",
        card_style: "elevated",
        data_density: "moderate",
        color_usage: "full_color",
      },
      item_display_format: "grid_cards",
      typography_style: "clean_sans",
      narrative: "Task tracker app",
      feature_details: [{ name: "Task list", description: "Manage tasks" }],
      reasoning_summary: "clear",
      domain_keywords: ["tasks", "workflow"],
    },
    spec: null,
    contentMap: null,
    generatedCode: "const App=()=>null;",
    appName: "Tracker",
    tagline: null,
    themeColor: null,
    pages: [],
    qualityScore: 50,
    qualityBreakdown: {
      layout_diversity: 50,
      visual_uniqueness: 50,
      domain_specificity: 50,
      navigation_correctness: 50,
      interaction_richness: 50,
      visual_richness: 50,
      form_styling: 50,
      content_layout_fit: 50,
    },
    pipelineArtifact: null,
    pipelineSummary: null,
    degraded: false,
    repairCount: 0,
    maxRepairs: 2,
    errors: [],
    result: null,
  };
}

describe("legacy repair handler", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.mocked(scoreFactoryDimensions).mockReturnValue({
      code_quality: 80,
      design_quality: 70,
      security: 80,
      performance: 75,
      overall: 76,
      issues: [],
    });
  });

  it("updates both qualityScore and qualityBreakdown when agent-fix path wins", async () => {
    vi.mocked(runAllFixAgents).mockReturnValue({
      code: "const App=()=> <div>improved</div>;",
      allFixes: ["fix-a"],
    });

    vi.mocked(scoreGeneratedCode)
      .mockReturnValueOnce({
        quality_score: 80,
        quality_breakdown: improvedBreakdown,
      })
      .mockReturnValueOnce({
        quality_score: 60,
        quality_breakdown: {
          ...improvedBreakdown,
          domain_specificity: 55,
        },
      });

    const ctx = makeCtx();
    const out = await handleRepair(ctx);

    expect(out.nextState).toBe("VALIDATING");
    expect(ctx.qualityScore).toBe(80);
    expect(ctx.qualityBreakdown).toEqual(improvedBreakdown);
  });

  it("injects fatal factory issues into repair instructions", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    vi.mocked(runAllFixAgents).mockReturnValue({
      code: "const App=()=> <div>candidate</div>;",
      allFixes: [],
    });
    vi.mocked(scoreGeneratedCode).mockReturnValue({
      quality_score: 60,
      quality_breakdown: improvedBreakdown,
    });
    vi.mocked(generateRetryFeedback).mockReturnValue("fix issues");
    vi.mocked(repairGeneratedCode).mockResolvedValue(null);

    const ctx = makeCtx();
    ctx.latestFactoryIssues = ["FATAL: light-theme contrast violation (text-white on light surfaces)"];

    await handleRepair(ctx);

    expect(repairGeneratedCode).toHaveBeenCalled();
    const repairInstructions = vi.mocked(repairGeneratedCode).mock.calls[0]?.[3] ?? "";
    expect(repairInstructions).toContain("CRITICAL FACTORY FAILURES");
    expect(repairInstructions).toContain("FATAL: light-theme contrast violation");
  });

  it("keeps a lower-score candidate when it clears fatal factory issues", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    vi.mocked(runAllFixAgents).mockReturnValue({
      code: "const App=()=> <div className='text-white'>candidate</div>;",
      allFixes: [],
    });
    vi.mocked(scoreGeneratedCode).mockReturnValue({
      quality_score: 45,
      quality_breakdown: {
        ...improvedBreakdown,
        visual_richness: 45,
      },
    });
    vi.mocked(generateRetryFeedback).mockReturnValue("fix contrast");
    vi.mocked(repairGeneratedCode).mockResolvedValue(
      "const App=()=> <div className='text-gray-900'>fixed-contrast" + " ".repeat(200) + "</div>;"
    );
    vi.mocked(scoreFactoryDimensions).mockImplementation((code: string) => {
      const fixed = code.includes("fixed-contrast");
      return {
        code_quality: 80,
        design_quality: 70,
        security: 80,
        performance: 75,
        overall: 76,
        issues: fixed ? [] : ["FATAL: light-theme contrast violation (text-white on light surfaces)"],
      };
    });

    const ctx = makeCtx();
    ctx.latestFactoryIssues = ["FATAL: light-theme contrast violation (text-white on light surfaces)"];
    ctx.qualityScore = 50;

    await handleRepair(ctx);

    expect(ctx.generatedCode).toContain("fixed-contrast");
    expect(ctx.qualityScore).toBe(45);
  });
});
