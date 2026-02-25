import Anthropic from "@anthropic-ai/sdk";
import { appSpecSchema } from "./schema.js";
import { translateEnglishPromptWithReasoning, type ReasonedIntent } from "./reasoner.js";
import type { AppSpec } from "../types/index.js";

const APPSPEC_SYSTEM_PROMPT = `You are an expert AI product engineer. Generate an AppSpec v2 JSON that defines a COMPLETE, POLISHED, commercially-viable AI app.

CRITICAL RULES:
1. schema_version MUST be "2"
2. ALWAYS generate 2-4 navigation tabs and matching screens
3. Each screen's nav_id MUST exactly match one navigation item's id
4. context_template uses {{key}} placeholders matching input_fields[].key exactly
5. Every required input_field key must appear in context_template
6. temperature: 0.3–0.8. max_tokens: 300–1500
7. primary color must be a valid hex like #22c55e
8. NO generic field names — every label must be domain-specific
9. system_prompts must be detailed expert instructions, not vague descriptions
10. The app must feel like a product someone would PAY FOR

OUTPUT FORMAT INSTRUCTIONS BY TYPE:
- "score_card": AI must output "**Score: X/100**" and "**Grade: X**" on first two lines, then ## sections for breakdown
- "cards": AI must output ## headers for each card item with bold key:value pairs
- "report": AI must output well-structured markdown with ## sections
- "list": AI must output a numbered or bulleted list with brief explanations
- "markdown": rich formatted markdown with headers and structure
- "plain": conversational paragraph response

SCREEN LAYOUT GUIDANCE:
- "analyzer": input area → results with score/breakdown (best for: food scanners, resume checkers, content analyzers)
- "generator": input form → rich generated content (best for: email writers, caption generators, cover letters)
- "tool": focused utility with form → calculated output (best for: pricing tools, calculators)
- "dashboard": stats overview + main action (best for: tracker home screens)
- "planner": structured multi-step plan output (best for: meal planners, study schedules, project roadmaps)`;

const appSpecToolSchema = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    schema_version: { type: "string", enum: ["2"] },
    name: { type: "string" },
    tagline: { type: "string" },
    description: { type: "string" },
    theme: {
      type: "object",
      additionalProperties: false,
      properties: {
        primary: { type: "string" },
        style: { type: "string", enum: ["light", "dark", "vibrant"] },
        icon: { type: "string" },
      },
      required: ["primary", "style", "icon"],
    },
    navigation: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          icon: { type: "string" },
        },
        required: ["id", "label", "icon"],
      },
    },
    screens: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nav_id: { type: "string" },
          layout: { type: "string", enum: ["tool", "analyzer", "generator", "dashboard", "planner"] },
          hero: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              cta_label: { type: "string" },
            },
            required: ["title", "subtitle", "cta_label"],
          },
          input_fields: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                key: { type: "string" },
                label: { type: "string" },
                type: { type: "string", enum: ["text", "textarea", "select", "number"] },
                placeholder: { type: "string" },
                options: { type: "array", items: { type: "string" }, maxItems: 20 },
                required: { type: "boolean" },
                max_length: { type: "integer" },
              },
              required: ["key", "label", "type", "required"],
            },
          },
          ai_logic: {
            type: "object",
            additionalProperties: false,
            properties: {
              system_prompt: { type: "string" },
              context_template: { type: "string" },
              temperature: { type: "number" },
              max_tokens: { type: "integer" },
            },
            required: ["system_prompt", "context_template", "temperature", "max_tokens"],
          },
          output_format: { type: "string", enum: ["markdown", "cards", "score_card", "report", "list", "plain"] },
          output_label: { type: "string" },
        },
        required: ["nav_id", "layout", "hero", "input_fields", "ai_logic", "output_format", "output_label"],
      },
    },
  },
  required: ["schema_version", "name", "tagline", "description", "theme", "navigation", "screens"],
};

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

async function buildAppSpecWithClaude(intent: ReasonedIntent, originalPrompt: string): Promise<AppSpec | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  try {
    const userMessage = [
      `Build a complete AppSpec v2 for this product:`,
      ``,
      `Original prompt: "${originalPrompt}"`,
      `Normalized goal: ${intent.primary_goal}`,
      `Domain: ${intent.domain}`,
      `Design philosophy: ${intent.design_philosophy}`,
      `Reference app: ${intent.reference_app ?? "none"}`,
      `App name hint: ${intent.app_name_hint}`,
      `Primary color: ${intent.primary_color}`,
      `Theme: ${intent.theme_style}`,
      `Icon: ${intent.app_icon}`,
      `Nav tabs planned: ${JSON.stringify(intent.nav_tabs)}`,
      `Primary output format: ${intent.output_format_hint}`,
      `Reasoning: ${intent.reasoning_summary}`,
      ``,
      `Generate a complete, polished AppSpec v2. Each screen must have domain-specific inputs, detailed system_prompts, and proper context_templates with {{key}} placeholders. Make it feel like a product someone would pay for.`,
    ].join("\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: APPSPEC_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      tools: [{
        name: "create_app_spec",
        description: "Create a complete AppSpec v2 JSON for a polished AI product",
        input_schema: appSpecToolSchema,
      }],
      tool_choice: { type: "tool", name: "create_app_spec" },
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;

    return appSpecSchema.parse(toolUse.input);
  } catch (e) {
    console.error("AppSpec generation failed:", e);
    return null;
  }
}

export interface PipelineResult {
  spec: AppSpec;
  intent: ReasonedIntent;
  pipeline: string[];
}

export async function runGenerationPipeline(prompt: string): Promise<PipelineResult> {
  const pipeline: string[] = [];

  pipeline.push("Prompt Reasoning");
  const intent = await translateEnglishPromptWithReasoning(prompt);

  const resolvedIntent: ReasonedIntent = intent ?? {
    normalized_prompt: prompt,
    app_name_hint: prompt.slice(0, 40),
    primary_goal: prompt,
    domain: "AI tools",
    design_philosophy: "Clean, functional tool",
    nav_tabs: [
      { id: "analyze", label: "Analyze", icon: "🔍", layout: "analyzer", purpose: "Main analysis tool" },
      { id: "results", label: "Results", icon: "📊", layout: "dashboard", purpose: "View results" },
    ],
    primary_color: "#6366f1",
    theme_style: "light",
    app_icon: "⚡",
    output_format_hint: "markdown",
    reasoning_summary: "Fallback: no LLM available",
  };

  pipeline.push("AppSpec Generation");
  const llmSpec = await buildAppSpecWithClaude(resolvedIntent, prompt);

  pipeline.push("Schema Validation");
  const spec = llmSpec ?? buildDeterministicAppSpec(resolvedIntent, prompt);
  const validatedSpec = appSpecSchema.parse(spec);

  return { spec: validatedSpec, intent: resolvedIntent, pipeline };
}
