import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReasonedIntent } from "./reasoner.js";

const { mockedTranslate } = vi.hoisted(() => ({
  mockedTranslate: vi.fn(),
}));

vi.mock("./reasoner.js", () => ({
  translateEnglishPromptWithReasoning: mockedTranslate,
}));

import { runGenerationPipeline } from "./pipeline.js";

describe("runGenerationPipeline", () => {
  beforeEach(() => {
    mockedTranslate.mockReset();
  });

  it("normalizes non-schema layout/output hints before app schema validation", async () => {
    mockedTranslate.mockResolvedValue({
      normalized_prompt: "Create an app like cal ai",
      app_name_hint: "Calio",
      primary_goal: "Track calories and macros daily",
      domain: "nutrition",
      reference_app: "Cal AI",
      design_philosophy: "Clear meal-first workflows",
      target_user: "Fitness-focused consumers",
      key_differentiator: "Fast logging and coaching",
      visual_style_keywords: ["clean", "modern"],
      premium_features: ["Macro goals", "Meal logging"],
      nav_tabs: [
        { id: "timeline", label: "Timeline", icon: "Calendar", layout: "timeline_dashboard", purpose: "Meal timeline" },
        { id: "chat", label: "Coach", icon: "MessageCircle", layout: "conversation", purpose: "AI coach chat" },
        { id: "stats", label: "Stats", icon: "BarChart3", layout: "stats_dashboard", purpose: "Progress metrics" },
        { id: "profile", label: "Profile", icon: "User", layout: "profile", purpose: "Goals and settings" },
      ],
      primary_color: "#22c55e",
      theme_style: "light",
      app_icon: "Apple",
      output_format_hint: "timeline_with_cards",
      layout_blueprint: "timeline-layout",
      animation_keywords: ["smooth"],
      visual_requirements: {
        hero_pattern: "minimal_header",
        card_style: "mixed",
        data_density: "moderate",
        color_usage: "full_color",
      },
      item_display_format: "grid_cards",
      typography_style: "clean_sans",
      narrative: "Nutrition tracker with AI coaching.",
      feature_details: [{ name: "Macro Coach", description: "Personalized macro guidance" }],
      reasoning_summary: "Maps to calorie tracking workflows",
      domain_keywords: ["calorie", "macro", "meal"],
    } satisfies ReasonedIntent);

    const result = await runGenerationPipeline("Create an app like cal ai");
    const layouts = result.spec.screens.map((s) => s.layout);
    const outputFormats = result.spec.screens.map((s) => s.output_format);

    expect(layouts).toEqual(["dashboard", "dashboard", "dashboard", "dashboard"]);
    expect(outputFormats.every((f) => f === "cards")).toBe(true);
  });

  it("includes domain_keywords in degraded fallback intent", async () => {
    mockedTranslate.mockResolvedValue(null);

    const result = await runGenerationPipeline("Create an app like cal ai");

    expect(Array.isArray(result.intent.domain_keywords)).toBe(true);
    expect((result.intent.domain_keywords ?? []).length).toBeGreaterThan(0);
  });
});
