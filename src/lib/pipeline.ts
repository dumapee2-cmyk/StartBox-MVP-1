import { appSpecSchema } from "./schema.js";
import { translateEnglishPromptWithReasoning, type ReasonedIntent } from "./reasoner.js";
import type { AppContextBrief } from "./contextResearch.js";
import type { AppSpec } from "../types/index.js";

function buildDeterministicAppSpec(intent: ReasonedIntent, originalPrompt: string): AppSpec {
  const screens = intent.nav_tabs.map((tab, i) => ({
    nav_id: tab.id,
    layout: tab.layout,
    hero: {
      title: i === 0 ? intent.primary_goal.slice(0, 60) : tab.purpose.slice(0, 60),
      subtitle: i === 0 ? `Powered by AI for ${intent.domain}` : tab.purpose.slice(0, 120),
      cta_label: i === 0 ? "Run Analysis" : "Generate",
    },
    input_fields: [{
      key: "input",
      label: intent.domain.charAt(0).toUpperCase() + intent.domain.slice(1) + " Input",
      type: "textarea" as const,
      placeholder: `Describe your ${intent.domain} here...`,
      required: true,
    }],
    ai_logic: {
      system_prompt: `You are an expert ${intent.domain} AI assistant. ${intent.primary_goal}. Provide detailed, actionable, professionally formatted responses.`,
      context_template: `{{input}}`,
      temperature: 0.7,
      max_tokens: 800,
    },
    output_format: intent.output_format_hint,
    output_label: i === 0 ? "Analysis" : "Results",
  }));

  return {
    schema_version: "2",
    name: intent.app_name_hint.slice(0, 80),
    tagline: intent.primary_goal.slice(0, 120),
    description: intent.primary_goal.slice(0, 500),
    theme: {
      primary: intent.primary_color,
      style: intent.theme_style,
      icon: intent.app_icon,
    },
    navigation: intent.nav_tabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon })),
    screens,
  };
}

export interface PipelineResult {
  spec: AppSpec;
  intent: ReasonedIntent;
  pipeline: string[];
}

export async function runGenerationPipeline(
  prompt: string,
  contextBrief?: AppContextBrief | null,
): Promise<PipelineResult> {
  const pipeline: string[] = [];

  pipeline.push("Prompt Reasoning");
  const intent = await translateEnglishPromptWithReasoning(prompt, contextBrief);

  const resolvedIntent: ReasonedIntent = intent ?? {
    normalized_prompt: prompt,
    app_name_hint: prompt.slice(0, 40),
    primary_goal: prompt,
    domain: "AI tools",
    design_philosophy: "Clean, functional tool",
    target_user: "General users",
    key_differentiator: "AI-powered analysis and generation",
    visual_style_keywords: ["clean", "minimal"],
    premium_features: ["AI analysis", "Instant results"],
    nav_tabs: [
      { id: "analyze", label: "Analyze", icon: "Search", layout: "analyzer", purpose: "Main analysis tool" },
      { id: "results", label: "Results", icon: "BarChart2", layout: "dashboard", purpose: "View results" },
    ],
    primary_color: "#6366f1",
    theme_style: "light",
    app_icon: "Zap",
    output_format_hint: "markdown",
    reasoning_summary: "Fallback: no LLM available",
  };

  pipeline.push("Schema Validation");
  const spec = buildDeterministicAppSpec(resolvedIntent, prompt);
  const validatedSpec = appSpecSchema.parse(spec);

  return { spec: validatedSpec, intent: resolvedIntent, pipeline };
}
