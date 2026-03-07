import { appSpecSchema } from "./schema.js";
import { translateEnglishPromptWithReasoning, type ReasonedIntent } from "./reasoner.js";
import type { AppContextBrief } from "./contextResearch.js";
import type { AppSpec } from "../types/index.js";
import { extractDomainKeywordsFromPrompt } from "./domainKeywords.js";

// Sanitize nav IDs to match schema regex /^[a-z_]+$/
function sanitizeNavId(id: string): string {
  return id.toLowerCase().replace(/[^a-z_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'tab';
}

// Random fallback name generator — no domain-locked templates
const FALLBACK_ADJECTIVES = ["Swift", "Bright", "Clear", "Prime", "Apex", "Nova", "Flux", "Vibe", "Core", "Zen"];
const FALLBACK_NOUNS = ["Flow", "Hub", "Kit", "Forge", "Craft", "Lab", "Desk", "Grid", "Vault", "Pulse"];

function generateFallbackName(): string {
  const adj = FALLBACK_ADJECTIVES[Math.floor(Math.random() * FALLBACK_ADJECTIVES.length)];
  const noun = FALLBACK_NOUNS[Math.floor(Math.random() * FALLBACK_NOUNS.length)];
  return `${adj}${noun.toLowerCase()}`;
}

// Random color from a broad palette — not domain-mapped
const FALLBACK_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#22c55e", "#0ea5e9", "#eab308", "#14b8a6", "#f43f5e", "#a855f7"];

function randomColor(): string {
  return FALLBACK_COLORS[Math.floor(Math.random() * FALLBACK_COLORS.length)];
}

const ALLOWED_LAYOUTS = ["tool", "analyzer", "generator", "dashboard", "planner"] as const;
const ALLOWED_OUTPUT_FORMATS = ["markdown", "cards", "score_card", "report", "list", "plain"] as const;

function normalizeLayout(layoutHint: string, primaryGoal: string): (typeof ALLOWED_LAYOUTS)[number] {
  const raw = `${layoutHint} ${primaryGoal}`.toLowerCase();

  for (const allowed of ALLOWED_LAYOUTS) {
    if (raw.includes(allowed)) return allowed;
  }
  if (/(analy|score|audit|diagnos|review|inspect|evaluate)/.test(raw)) return "analyzer";
  if (/(generat|create|writer|compose|synth|builder)/.test(raw)) return "generator";
  if (/(plan|schedule|roadmap|timeline|calendar|task|itinerary)/.test(raw)) return "planner";
  if (/(dashboard|overview|stats|metric|insight|profile|chat|conversation|feed)/.test(raw)) return "dashboard";
  return "tool";
}

function normalizeOutputFormat(outputHint: string, primaryGoal: string): (typeof ALLOWED_OUTPUT_FORMATS)[number] {
  const raw = `${outputHint} ${primaryGoal}`.toLowerCase();

  for (const allowed of ALLOWED_OUTPUT_FORMATS) {
    if (raw.includes(allowed)) return allowed;
  }
  if (/(score|grade|rating|risk score)/.test(raw)) return "score_card";
  if (/(report|summary|analysis|breakdown|brief)/.test(raw)) return "report";
  if (/(timeline|list|table|rows|steps|checklist)/.test(raw)) return "list";
  if (/(card|grid|gallery|kanban|tile|timeline_with_cards)/.test(raw)) return "cards";
  if (/(plain|text-only|text only)/.test(raw)) return "plain";
  return "markdown";
}

function buildDeterministicAppSpec(intent: ReasonedIntent, originalPrompt: string): AppSpec {
  const safeOutputFormat = normalizeOutputFormat(intent.output_format_hint, intent.primary_goal);
  const screens = intent.nav_tabs.map((tab, i) => ({
    nav_id: sanitizeNavId(tab.id),
    layout: normalizeLayout(tab.layout, intent.primary_goal),
    hero: {
      title: i === 0 ? intent.primary_goal.slice(0, 60) : tab.purpose.slice(0, 60),
      subtitle: i === 0 ? intent.primary_goal.slice(0, 120) : tab.purpose.slice(0, 120),
      cta_label: i === 0 ? "Run Analysis" : "Generate",
    },
    input_fields: [{
      key: "input",
      label: (intent.domain.charAt(0).toUpperCase() + intent.domain.slice(1) + " Input").slice(0, 80),
      type: "textarea" as const,
      placeholder: `Describe your ${intent.domain.slice(0, 60)} here...`.slice(0, 500),
      required: true,
    }],
    ai_logic: {
      system_prompt: `You are an expert ${intent.domain} AI assistant. ${intent.primary_goal}. Provide detailed, actionable, professionally formatted responses.`,
      context_template: `{{input}}`,
      temperature: 0.7,
      max_tokens: 800,
    },
    output_format: safeOutputFormat,
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
    navigation: intent.nav_tabs.map((t) => ({ id: sanitizeNavId(t.id), label: t.label, icon: t.icon })),
    screens,
  };
}

export interface PipelineResult {
  spec: AppSpec;
  intent: ReasonedIntent;
  pipeline: string[];
  degraded: boolean;
}

export async function runGenerationPipeline(
  prompt: string,
  contextBrief?: AppContextBrief | null,
): Promise<PipelineResult> {
  const pipeline: string[] = [];

  pipeline.push("Prompt Reasoning");
  const intent = await translateEnglishPromptWithReasoning(prompt, contextBrief);

  const degraded = intent === null;
  if (degraded) {
    console.error("[Pipeline] LLM reasoner returned null — generation cannot produce domain-specific output");
    console.error("[Pipeline] Prompt was:", JSON.stringify(prompt.slice(0, 200)));
  }

  // Build a prompt-grounded fallback that preserves the user's words
  // instead of substituting generic "Smart Tools" templates
  const fallbackName = generateFallbackName();
  const promptSnippet = prompt.slice(0, 120).trim();
  const resolvedIntent: ReasonedIntent = intent ?? {
    normalized_prompt: prompt,
    app_name_hint: fallbackName,
    primary_goal: promptSnippet,
    domain: promptSnippet,  // use actual prompt text, not "Smart Tools"
    design_philosophy: "Clean, functional design with thoughtful visual hierarchy and smooth interactions",
    target_user: "General users",
    key_differentiator: `Designed around: ${promptSnippet}`,
    visual_style_keywords: ["clean", "spacious", "modern"],
    premium_features: [promptSnippet.slice(0, 60)],
    nav_tabs: [
      { id: "main", label: "Main", icon: "Home", layout: "dashboard", purpose: `Core experience for: ${promptSnippet.slice(0, 80)}` },
      { id: "settings", label: "Settings", icon: "Settings", layout: "tool", purpose: "Configuration and preferences" },
    ],
    primary_color: randomColor(),
    theme_style: "light",
    app_icon: "Zap",
    output_format_hint: "markdown",
    narrative: `${fallbackName} — ${promptSnippet}.`,
    feature_details: [
      { name: promptSnippet.slice(0, 50), description: `Core feature based on: ${promptSnippet}` },
    ],
    reasoning_summary: "[DEGRADED] LLM reasoner failed — this is a prompt-grounded fallback, not full AI planning",
    domain_keywords: extractDomainKeywordsFromPrompt(promptSnippet, { max: 15 }),
    layout_blueprint: "flexible",
    animation_keywords: ["smooth", "subtle"],
    visual_requirements: {
      hero_pattern: "gradient_banner",
      card_style: "mixed",
      data_density: "moderate",
      color_usage: "full_color",
    },
    item_display_format: "grid_cards",
    typography_style: "bold_headlines",
  };

  pipeline.push("Schema Validation");
  const spec = buildDeterministicAppSpec(resolvedIntent, prompt);
  const validatedSpec = appSpecSchema.parse(spec);

  return { spec: validatedSpec, intent: resolvedIntent, pipeline, degraded };
}
