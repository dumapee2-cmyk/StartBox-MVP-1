import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AppContextBrief } from "./contextResearch.js";
import { withTimeout } from "./llmTimeout.js";
import { recordSpend, calculateCost } from "./costTracker.js";
import { resolveModel } from "./modelResolver.js";
import { extractJSON, extractTextFromResponse, llmLog } from "./llmCompat.js";
import {
  buildReasonerUserPrompt,
} from "./prompts/reasonerPrompt.js";
import { extractDomainKeywordsFromPrompt, normalizeDomainKeywords } from "./domainKeywords.js";

const reasonedIntentSchema = z.object({
  normalized_prompt: z.string().min(1),
  app_name_hint: z.string().min(1).transform(s => s.slice(0, 80)),
  primary_goal: z.string().min(1).transform(s => s.slice(0, 300)),
  domain: z.string().min(1).transform(s => s.slice(0, 100)),
  reference_app: z.string().nullable().optional(),
  design_philosophy: z.string().min(1).transform(s => s.slice(0, 300)),
  target_user: z.string().min(1).transform(s => s.slice(0, 200)),
  key_differentiator: z.string().min(1).transform(s => s.slice(0, 300)),
  visual_style_keywords: z.array(z.string()).min(1).max(10),
  premium_features: z.array(z.string()).min(1).max(10),
  nav_tabs: z.array(z.object({
    id: z.string(),
    label: z.string().transform(s => s.slice(0, 30)),
    icon: z.string().min(1).max(30),
    layout: z.string().min(1).max(50),
    purpose: z.string().transform(s => s.slice(0, 200)),
  })).min(2).max(4),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  theme_style: z.enum(["light", "dark", "vibrant"]),
  app_icon: z.string().min(1).max(30),
  output_format_hint: z.string().min(1).max(50),
  layout_blueprint: z.string().min(1),
  animation_keywords: z.array(z.string()).min(1).max(3),
  visual_requirements: z.object({
    hero_pattern: z.string().min(1).max(50),
    card_style: z.string().min(1).max(50),
    data_density: z.string().min(1).max(50),
    color_usage: z.string().min(1).max(50),
  }),
  item_display_format: z.string().min(1).max(50),
  typography_style: z.string().min(1).max(50),
  narrative: z.string().min(1).transform(s => s.slice(0, 500)),
  feature_details: z.array(z.object({ name: z.string(), description: z.string() })).min(1).max(10),
  reasoning_summary: z.string().min(1),
  domain_keywords: z.array(z.string()).optional(),
});

export type ReasonedIntent = z.infer<typeof reasonedIntentSchema>;

function withNormalizedKeywords(intent: ReasonedIntent, prompt: string): ReasonedIntent {
  const fromIntent = Array.isArray(intent.domain_keywords) ? intent.domain_keywords : [];
  const normalized = normalizeDomainKeywords(fromIntent, { max: 15 });
  const fallback = extractDomainKeywordsFromPrompt(prompt, { max: 15 });
  return {
    ...intent,
    domain_keywords: normalized.length > 0 ? normalized : fallback,
  };
}

/* ------------------------------------------------------------------ */
/*  Compressed Reasoner System Prompt                                   */
/* ------------------------------------------------------------------ */

const REASONER_SYSTEM_PROMPT = `You analyze app ideas and extract structured intent for code generation. Return valid JSON only.

=== CORE RULES ===
- When user says "like [Product]" or "similar to [Product]", use your knowledge of that product to set domain, features, layout, and visual style. The referenced product is the most important context.
- Generate ORIGINAL product names — never reuse exact brand names. Name must match the domain.
- All icons must be Lucide React PascalCase names.
- Provide 2-4 navigation tabs with specific, buildable purposes describing what UI elements to build.
- Include domain_keywords: 6-15 specific terms users would see in the UI.

=== LAYOUT OPTIONS ===
Choose layout_blueprint by app purpose: analyzer, generator, tool, dashboard, planner, browse, marketplace, portfolio, kanban, timeline, or describe a custom pattern.
Spatial patterns: grid-dashboard, bento-overview, sidebar-detail, split-form-output, marketplace-grid, magazine-layout, kanban-board, carousel-showcase, or custom. Prefer wide multi-column layouts over narrow centered ones.

=== DISPLAY & TYPOGRAPHY ===
item_display_format: grid_cards, table_rows, list_items, kanban_columns, timeline, bento_grid, carousel, masonry.
typography_style: bold_headlines, editorial_serif, compact_data, magazine, playful, modern_geometric, clean_sans.
output_format_hint: score_card, cards, report, list, markdown, plain, or custom.

=== VISUAL STYLE ===
visual_style_keywords (pick 2-5): minimal, clean, spacious, dark, moody, rich, vibrant, energetic, bold, glassmorphic, frosted, layered, warm, organic, earthy, corporate, structured, playful, rounded, friendly.
visual_requirements: hero_pattern (gradient_banner, metric_dashboard, search_hero, minimal_header, none), card_style (mixed, accent_border, gradient, elevated, flat), data_density (sparse, moderate, dense), color_usage (monochrome_accent, full_color, gradient_heavy, dark_with_glow).
animation_keywords (1-3): smooth, subtle, precise, bouncy, playful, energetic, elegant, slow, refined, snappy, sharp, minimal.

=== COLOR ===
Choose colors matching the domain. Professional = cooler tones. Health/fitness = greens/oranges. Creative = purples/vibrant.

=== FEATURES ===
For each feature, describe what UI component it maps to and how items should be displayed. Be specific about grid sizes, card structure, and interactions.

=== NARRATIVE ===
1-2 sentence product description (NOT first person).

=== REFERENCE APP HANDLING ===
If the user references a real product: set reference_app, use YOUR KNOWLEDGE to fill ALL fields matching that product's domain, features, and UX patterns. Only the name should differ.`;

/* ------------------------------------------------------------------ */
/*  Salvage partial responses                                           */
/* ------------------------------------------------------------------ */

function salvagePartialIntent(raw: unknown, prompt: string): ReasonedIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const snippet = prompt.slice(0, 120).trim();
  const shortSnippet = prompt.slice(0, 50).trim();

  const defaults: Record<string, unknown> = {
    normalized_prompt: prompt,
    app_name_hint: shortSnippet.split(/\s+/).slice(0, 2).join("") || "MyApp",
    primary_goal: snippet,
    domain: snippet,
    design_philosophy: "Clean, functional design with thoughtful visual hierarchy",
    target_user: "General users",
    key_differentiator: `Designed around: ${snippet}`,
    visual_style_keywords: ["clean", "spacious", "modern"],
    premium_features: [shortSnippet],
    nav_tabs: [
      { id: "main", label: "Main", icon: "Home", layout: "dashboard", purpose: `Core experience for: ${snippet.slice(0, 80)}` },
      { id: "settings", label: "Settings", icon: "Settings", layout: "tool", purpose: "Configuration and preferences" },
    ],
    primary_color: "#6366f1",
    theme_style: "light",
    app_icon: "Zap",
    output_format_hint: "markdown",
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
    narrative: `A tool for "${snippet}".`,
    feature_details: [
      { name: shortSnippet, description: `Core feature based on: ${snippet}` },
    ],
    reasoning_summary: "Recovered from partial model output — prompt-grounded salvage",
    domain_keywords: extractDomainKeywordsFromPrompt(prompt, { max: 15 }),
  };

  const merged: Record<string, unknown> = {};
  for (const key of Object.keys(defaults)) {
    merged[key] = r[key] !== undefined && r[key] !== null ? r[key] : defaults[key];
  }
  for (const key of Object.keys(r)) {
    if (merged[key] === undefined) merged[key] = r[key];
  }

  const incomingKeywords = Array.isArray(merged.domain_keywords)
    ? (merged.domain_keywords as string[])
    : [];
  merged.domain_keywords = normalizeDomainKeywords(incomingKeywords, { max: 15 });

  const result = reasonedIntentSchema.safeParse(merged);
  if (result.success) {
    console.log("Salvaged partial intent — recovered fields:", Object.keys(defaults).filter((k) => r[k] === undefined || r[k] === null).join(", ") || "none");
    return withNormalizedKeywords(result.data, prompt);
  }

  console.warn("Salvage also failed:", result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "));
  return null;
}

/* ------------------------------------------------------------------ */
/*  Text/JSON reasoner (Kimi K2.5)                                     */
/* ------------------------------------------------------------------ */

async function runTextReasoner(
  client: Anthropic,
  modelId: string,
  prompt: string,
  contextSection: string,
  timeoutMs: number,
): Promise<ReasonedIntent | null> {
  const response = await withTimeout(
    (signal) => client.messages.create({
      model: modelId,
      max_tokens: 16000,
      temperature: 0.9,
      system: REASONER_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: buildReasonerUserPrompt(prompt, contextSection),
      }],
    }, { signal }),
    timeoutMs,
    "Prompt reasoner",
  );

  const u = response.usage as unknown as Record<string, number>;
  recordSpend(calculateCost(modelId, {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
  }));

  const textContent = extractTextFromResponse(
    response.content as Array<{ type: string; text?: string; thinking?: string }>,
  );

  if (!textContent) {
    console.warn("Text reasoner returned empty response after stripping thinking content");
    console.warn("Response content block types:", response.content.map(b => b.type).join(", "));
    return null;
  }

  console.log(`Text reasoner response: ${textContent.length} chars (content blocks: ${response.content.map(b => b.type).join(", ")})`);

  try {
    const jsonStr = extractJSON(textContent);
    const parsed = JSON.parse(jsonStr);

    const strict = reasonedIntentSchema.safeParse(parsed);
    if (strict.success) return withNormalizedKeywords(strict.data, prompt);

    console.warn(
      "Text reasoner strict parse failed, salvaging:",
      strict.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
    );
    return salvagePartialIntent(parsed, prompt);
  } catch (e) {
    console.warn("Text reasoner JSON parse failed:", e instanceof Error ? e.message : e);
    console.warn("Raw response (first 500 chars):", textContent.slice(0, 500));
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Simplified text reasoner retry (fewer required fields)              */
/* ------------------------------------------------------------------ */

async function runSimplifiedTextReasoner(
  client: Anthropic,
  modelId: string,
  prompt: string,
  timeoutMs: number,
): Promise<ReasonedIntent | null> {
  console.log("Attempting simplified text reasoner retry...");

  const response = await withTimeout(
    (signal) => client.messages.create({
      model: modelId,
      max_tokens: 4000,
      temperature: 0.7,
      system: `You are an app designer. Given a user's app idea, extract structured intent as JSON.\nRespond ONLY with a valid JSON object. No markdown, no explanation.`,
      messages: [{
        role: "user",
        content: `App idea: "${prompt}"\n\nReturn JSON with these fields:\n- app_name_hint: string (original invented name)\n- primary_goal: string (1 sentence)\n- domain: string (category)\n- reference_app: string or null\n- nav_tabs: array of {id, label, icon, layout, purpose} (2-3 tabs)\n- primary_color: string (hex like #6366f1)\n- theme_style: "light" or "dark"\n- premium_features: string array (3-5 features)\n- feature_details: array of {name, description}\n- narrative: string (1 sentence description)\n- visual_style_keywords: string array`,
      }],
    }, { signal }),
    timeoutMs,
    "Simplified reasoner",
  );

  const u = response.usage as unknown as Record<string, number>;
  recordSpend(calculateCost(modelId, {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
  }));

  const textContent = extractTextFromResponse(
    response.content as Array<{ type: string; text?: string; thinking?: string }>,
  );

  if (!textContent) return null;

  try {
    const jsonStr = extractJSON(textContent);
    const parsed = JSON.parse(jsonStr);
    return salvagePartialIntent(parsed, prompt);
  } catch (e) {
    console.warn("Simplified reasoner JSON parse also failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Context section builder                                             */
/* ------------------------------------------------------------------ */

function buildContextSection(contextBrief?: AppContextBrief | null): string {
  if (!contextBrief) return '';
  return [
    `\n--- COMPETITIVE RESEARCH CONTEXT ---`,
    `Similar products: ${contextBrief.competitive_landscape.map(c => `${c.name}: ${c.key_ux_patterns.join(', ')}`).join(' | ')}`,
    `Visual signatures: ${contextBrief.competitive_landscape.map(c => `${c.name}: ${c.visual_signature}`).join(' | ')}`,
    `Target user: ${contextBrief.target_persona.role} — Pain points: ${contextBrief.target_persona.pain_points.join(', ')}`,
    `User expectations: ${contextBrief.target_persona.expectations.join(', ')}`,
    `Must-have features: ${contextBrief.must_have_features.join(', ')}`,
    `Differentiating features: ${contextBrief.differentiating_features.join(', ')}`,
    `Design guidance: ${contextBrief.design_references.color_psychology}. Layout: ${contextBrief.design_references.layout_pattern}. Typography: ${contextBrief.design_references.typography_style}`,
    `Visual motifs: ${contextBrief.design_references.visual_motifs.join(', ')}`,
    `Domain field labels: ${JSON.stringify(contextBrief.domain_terminology.field_labels)}`,
    `CTA verbs: ${contextBrief.domain_terminology.cta_verbs.join(', ')}`,
    `Section headers: ${contextBrief.domain_terminology.section_headers.join(', ')}`,
    ...(contextBrief.ui_component_suggestions?.length ? [`UI component patterns: ${contextBrief.ui_component_suggestions.join(', ')}`] : []),
    ...(contextBrief.animation_style ? [`Recommended animation style: ${contextBrief.animation_style}`] : []),
    ...(contextBrief.layout_blueprint ? [`Layout blueprint: ${contextBrief.layout_blueprint}`] : []),
    `---`,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/*  Unified reasoner entry                                              */
/* ------------------------------------------------------------------ */

async function runReasoner(
  prompt: string,
  contextBrief?: AppContextBrief | null,
): Promise<ReasonedIntent | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const client = new Anthropic({
    apiKey,
    maxRetries: 3,
    ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
  });
  const timeoutMs = Number(process.env.STARTBOX_REASONER_TIMEOUT_MS ?? 150000);
  const contextSection = buildContextSection(contextBrief);
  const modelId = resolveModel("fast");

  llmLog("reasoner", { model: modelId });
  const result = await runTextReasoner(client, modelId, prompt, contextSection, timeoutMs);
  if (result) return result;

  // Retry with simplified prompt (fewer fields, simpler instructions)
  llmLog("reasoner", { model: modelId, note: "simplified retry" });
  return runSimplifiedTextReasoner(client, modelId, prompt, timeoutMs);
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                    */
/* ------------------------------------------------------------------ */

export async function translateEnglishPromptWithReasoning(
  prompt: string,
  contextBrief?: AppContextBrief | null,
): Promise<ReasonedIntent | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    console.log("Starting reasoner pipeline...");
    return await runReasoner(prompt, contextBrief);
  } catch (e) {
    console.error("Reasoner failed:", e);
    return null;
  }
}
