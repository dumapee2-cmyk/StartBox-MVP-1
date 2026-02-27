import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { ReasonedIntent } from "./reasoner.js";
import type { AppContextBrief } from "./contextResearch.js";
import { scoreGeneratedCode } from "./qualityScorer.js";
import { recordSpend } from "./costTracker.js";
import type { ProgressCallback } from "./progressEmitter.js";
import type { PipelineRunArtifact, QualityBreakdown } from "../types/index.js";


export interface CodeGenerationResult {
  generated_code: string;
  app_name: string;
  tagline: string;
  primary_color: string;
  icon: string;
  pages: string[];
  quality_score: number;
  quality_breakdown: QualityBreakdown;
  pipeline_artifact: PipelineRunArtifact;
}

/* ------------------------------------------------------------------ */
/*  Dynamic system prompt — only includes layout-relevant sections     */
/* ------------------------------------------------------------------ */

const LAYOUT_GUIDES: Record<string, string> = {
  analyzer: `APP LAYOUT — ANALYZER (food scanner, resume checker, code reviewer):
- Home: glass hero -> glass input card (p-5 rounded-2xl) -> full-width CTA (h-12)
- Results: ScoreRing (SVG with glow), breakdown cards, metric rows
- History: vertical glass card list with timestamps`,
  generator: `APP LAYOUT — GENERATOR (email writer, caption gen, story creator):
- Home: hero -> glass input card (textarea + option pills) -> generate CTA
- Output: glass result card with copy button, tab switcher for variants`,
  tool: `APP LAYOUT — TOOL (calculator, converter, estimator):
- Single screen: hero -> glass input card -> live result card below
- Result: large glowing number/value centered`,
  dashboard: `APP LAYOUT — DASHBOARD (tracker, monitor, portfolio):
- Home: stat grid (sm:grid-cols-2 lg:grid-cols-3) -> activity feed
- Stat card: glass card, icon with glow, big number, label`,
  planner: `APP LAYOUT — PLANNER (study planner, meal planner, roadmap):
- Home: progress glass card (day X of Y, progress bar with glow) -> today's items
- Each item: glass card with colored left accent border`,
};

const DEMO_HINTS: Record<string, string> = {
  analyzer: 'Pre-populated result with score 87/100, breakdown cards, 3 history entries.',
  generator: 'Show 2 pre-generated variants on load. One fully visible.',
  tool: 'Pre-filled input with calculated result shown immediately.',
  dashboard: '5+ stat cards with realistic numbers, 3-5 recent activity items.',
  planner: '"Day 2 of 14" progress, color-coded items, 3+ plan entries.',
};

function buildCodeGenSystemPrompt(layout: string): string {
  const layoutGuide = LAYOUT_GUIDES[layout] ?? LAYOUT_GUIDES.analyzer;
  const demoHint = DEMO_HINTS[layout] ?? DEMO_HINTS.analyzer;

  const scoreRing = layout === 'analyzer' ? `
ScoreRing component (use for score displays):
function ScoreRing({score,size=120,color}) {
  const r=(size/2)-10,c=2*Math.PI*r,offset=c-(score/100)*c;
  return React.createElement('div',{className:'flex flex-col items-center',style:{animation:'scaleIn 0.5s ease-out'}},
    React.createElement('svg',{width:size,height:size,viewBox:'0 0 '+size+' '+size,style:{filter:'drop-shadow(0 0 8px '+color+'40)'}},
      React.createElement('circle',{cx:size/2,cy:size/2,r,fill:'none',stroke:'rgba(255,255,255,0.06)',strokeWidth:8}),
      React.createElement('circle',{cx:size/2,cy:size/2,r,fill:'none',stroke:color,strokeWidth:8,strokeLinecap:'round',strokeDasharray:c,strokeDashoffset:offset,style:{animation:'ringFill 1s ease-out forwards','--ring-circumference':c,'--ring-offset':offset},transform:'rotate(-90 '+size/2+' '+size/2+')'})
    ),
    React.createElement('div',{className:'text-3xl font-bold mt-2 text-white',style:{animation:'countUp 0.6s ease-out 0.3s both'}},score),
    React.createElement('div',{className:'text-xs text-gray-500'},'/100')
  );
}` : '';

  return `You are a world-class UI engineer building premium dark-glass web apps. Think Cluely, Perplexity, Linear, Raycast — apps worth $30/month. Every app must look like a real shipping product unique to its domain.

RULES:
1. NO imports — destructure: const { useState, useEffect, useRef, useCallback, useMemo } = React;
2. Icons from window.LucideReact — destructure needed icons:
   const { Search, Star, Zap, ArrowRight, Upload, Download, Copy, Check, X, Plus, Minus, BarChart2, FileText, Settings, Home, History, RefreshCw, Loader2, ChevronDown, ExternalLink, Trash2, Clock, Target, TrendingUp, Shield, Heart, Sparkles, Eye, Bell, Calendar, Users, Filter, Info, CheckCircle, ArrowDown } = window.LucideReact || {};
   Any Lucide icon is available — add more to destructuring as needed.
   Render: React.createElement(Icon, { size: 20, strokeWidth: 1.5 })
   SafeIcon: const SafeIcon = ({icon:Icon,size=20,...p}) => Icon ? React.createElement(Icon,{size,strokeWidth:1.5,...p}) : null;
3. Tailwind CSS only — style attr only for dynamic values
4. AI: const result = await window.__sbAI(SYSTEM_PROMPT, userMessage);
5. Pages: const [page, setPage] = useState('home');
6. LAST LINE: ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));

ZERO EMOJI anywhere — use Lucide icons or text characters only.

DARK GLASS DESIGN:
BG: bg-[#0a0a0f]. NO light/white backgrounds.
Glass: bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl | Hover: bg-white/[0.08] border-white/[0.12] | Elevated: bg-white/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]
Text: white/90 primary, gray-400 secondary, gray-500 muted. NO dark text.
Inputs: bg-white/[0.04] border-white/[0.08] rounded-xl text-white placeholder:text-gray-500 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 px-4 py-3.5
Buttons: Primary h-12 rounded-xl font-semibold glow | Secondary bg-white/[0.06] border-white/[0.08] | Ghost text-gray-400 hover:text-white | Pill px-4 py-2 rounded-full bg-white/[0.06] text-sm
Accents: primaryColor for CTAs, active states. Glow: box-shadow 0 0 20px rgba(COLOR,0.3).

TOP NAV (sticky, NOT bottom/sidebar):
sticky top-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/[0.06] h-14
Left: icon (w-8 h-8 rounded-lg bg primaryColor/20) + name. Right: tabs. Active: text-white bg-white/[0.06].

CONTENT: max-w-4xl mx-auto px-4 py-6. Grid: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4

ANIMATIONS (pre-loaded — just use):
fadeIn, slideUp, scaleIn, shimmer, countUp, ringFill, slideIn, bounceIn, pulse
Cards: style={{ animation: 'slideUp 0.4s ease-out '+(i*0.08)+'s both' }}

HERO: Glass card with radial gradient from primaryColor. Domain-appropriate accent.

${layoutGuide}

COMPONENTS:
${scoreRing}
- History: localStorage with STORAGE_KEY. Save after AI results. Glass card list.
- Copy: navigator.clipboard.writeText(text). "Copied" state 2s.
- Errors: rounded-xl p-4 bg-red-500/10 border-red-500/20 text-red-400
- Skeleton: shimmer bars (linear-gradient 90deg white/4>8>4, bgSize 200%, animation shimmer 1.5s infinite)

CODE EFFICIENCY (IMPORTANT — reduces cost):
- Extract repeated Tailwind strings into const: const card = 'rounded-2xl p-5 bg-white/[0.04] border border-white/[0.06]';
- Create small helpers for repeated JSX patterns. DRY > verbose.
- Minimal comments — code should be self-documenting.
- Prefer concise createElement calls. Every token counts.

NO: emoji, light backgrounds, bottom/sidebar nav, opaque surfaces, dark text on dark bg, spinners (use skeletons), empty states, "Powered by AI", tiny targets (<44px).

DEMO DATA: Realistic pre-populated data on first load. ${demoHint}

QUALITY: Would a Linear/Perplexity designer approve? Glass depth, glows, smooth animations, consistent spacing.`;
}

const codeGenToolSchema = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    generated_code: {
      type: "string",
      description: "The complete single-file React JSX application code. ZERO emoji characters allowed.",
    },
    app_name: {
      type: "string",
      description: "Short, catchy product name (2-3 words max)",
    },
    tagline: {
      type: "string",
      description: "One-line value proposition (under 60 chars)",
    },
    primary_color: {
      type: "string",
      description: "Primary accent hex color e.g. #22c55e",
    },
    icon: {
      type: "string",
      description: "Lucide React icon name in PascalCase, e.g. 'Utensils', 'FileText', 'Zap'",
    },
    pages: {
      type: "array",
      items: { type: "string" },
      description: "List of page/tab names in the app",
    },
  },
  required: ["generated_code", "app_name", "tagline", "primary_color", "icon", "pages"],
};

const QUALITY_GATE_SCORE = 78;


function cleanGeneratedCode(rawCode: string): string {
  return (rawCode ?? "")
    .replace(/^```(?:jsx?|tsx?|javascript)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();
}

async function runToolCodeGeneration(
  client: Anthropic,
  modelId: string,
  systemPrompt: string,
  userMessage: string,
  onProgress?: ProgressCallback,
): Promise<CodeGenerationResult | null> {
  const timeoutMs = Number(process.env.STARTBOX_CODEGEN_TIMEOUT_MS ?? 180000);

  // Use streaming with AbortController so timeouts actually cancel the request
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const stream = client.messages.stream({
      model: modelId,
      max_tokens: 12000,
      system: [
        {
          type: "text" as const,
          text: systemPrompt,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
      tools: [
        {
          name: "generate_react_app",
          description:
            "Generate a complete, single-file React application with all features. ZERO emoji allowed.",
          input_schema: codeGenToolSchema,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      tool_choice: { type: "tool", name: "generate_react_app" },
    }, { signal: controller.signal });

    // Hook into streaming to detect components being written in real-time
    const detectedComponents = new Set<string>();
    const componentPattern = /function\s+([A-Z][A-Za-z0-9]+)\s*\(/g;

    stream.on('inputJson', (_delta: string, snapshot: unknown) => {
      if (!onProgress) return;
      const snap = snapshot as Record<string, unknown>;
      const code = typeof snap?.generated_code === 'string' ? snap.generated_code : '';
      if (!code) return;

      componentPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = componentPattern.exec(code)) !== null) {
        const name = match[1];
        if (!detectedComponents.has(name)) {
          detectedComponents.add(name);
          onProgress({ type: 'writing', message: `Wrote ${name}`, data: { component: name } });
        }
      }
    });

    const response = await stream.finalMessage();

    // Emit "created" for all detected components after stream completes
    if (onProgress && detectedComponents.size > 0) {
      onProgress({ type: 'created', message: 'Created', data: { components: Array.from(detectedComponents) } });
    }
    clearTimeout(timeoutHandle);

    const usage = response.usage as unknown as Record<string, number>;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheCreate = usage.cache_creation_input_tokens ?? 0;
    const uncached = usage.input_tokens - cacheRead - cacheCreate;
    // Sonnet pricing: $3/M input, $15/M output, cache write $3.75/M, cache read $0.30/M
    const cost = ((uncached * 3 + cacheCreate * 3.75 + cacheRead * 0.30 + usage.output_tokens * 15) / 1_000_000);
    console.log(`Code gen tokens — input: ${usage.input_tokens} (cached: ${cacheRead}, wrote: ${cacheCreate}), output: ${usage.output_tokens} (est cost: $${cost.toFixed(3)})`);
    recordSpend(cost);

    if (response.stop_reason === "max_tokens") {
      console.warn("Code generation hit max_tokens limit — output may be truncated");
    }

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;

    const raw = toolUse.input as CodeGenerationResult;
    const cleanCode = cleanGeneratedCode(raw.generated_code ?? "");
    if (!cleanCode) return null;
    return { ...raw, generated_code: cleanCode };
  } catch (e) {
    clearTimeout(timeoutHandle);
    if (controller.signal.aborted) {
      throw new Error(`Code generation timed out after ${timeoutMs}ms`);
    }
    throw e;
  }
}

export async function generateReactCode(
  intent: ReasonedIntent,
  originalPrompt: string,
  model: "sonnet" | "opus" = "sonnet",
  contextBrief?: AppContextBrief | null,
  onProgress?: ProgressCallback,
): Promise<CodeGenerationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey, maxRetries: 0 });

  // Sonnet for quality code generation + prompt caching to reduce costs
  const modelId =
    model === "opus" ? "claude-opus-4-6" : "claude-sonnet-4-6";

  const primaryLayout = intent.nav_tabs[0]?.layout ?? 'analyzer';

  // Build layout-specific system prompt (reduces input tokens ~40%)
  const systemPrompt = buildCodeGenSystemPrompt(primaryLayout);

  // Only include unique context fields not already captured in intent
  const contextSection = contextBrief ? [
    ``,
    `--- CONTEXT ---`,
    `Competitors: ${contextBrief.competitive_landscape.map(c => `${c.name} (${c.visual_signature})`).join('; ')}`,
    `Visual motifs: ${contextBrief.design_references.visual_motifs.join(', ')}`,
    `Field labels: ${JSON.stringify(contextBrief.domain_terminology.field_labels)}`,
    `CTA verbs: ${contextBrief.domain_terminology.cta_verbs.join(', ')}`,
    ...(contextBrief.ui_component_suggestions?.length ? [`UI patterns: ${contextBrief.ui_component_suggestions.join(', ')}`] : []),
    `---`,
  ].join('\n') : '';

  const baseUserMessage = [
    `Build a complete React app:`,
    `Prompt: "${originalPrompt}"`,
    `Concept: ${intent.primary_goal}`,
    `Domain: ${intent.domain} | Design: ${intent.design_philosophy}`,
    `Style: ${intent.visual_style_keywords?.join(", ") ?? "clean, modern"}`,
    `User: ${intent.target_user ?? "general"} | Differentiator: ${intent.key_differentiator ?? "AI-powered"}`,
    `Features: ${intent.premium_features?.join(", ") ?? "standard"}`,
    ...(intent.reference_app ? [`Ref: ${intent.reference_app}`] : []),
    `Name: ${intent.app_name_hint} | Color: ${intent.primary_color} | Icon: ${intent.app_icon}`,
    `Pages: ${intent.nav_tabs.map((t) => `${t.label} (${t.icon})`).join(", ")}`,
    `Output: ${intent.output_format_hint}`,
    contextSection,
    `Type: ${primaryLayout.toUpperCase()} — use the layout pattern from system instructions.`,
    `AI system prompt inside app MUST produce structured output matching (${intent.output_format_hint}).`,
  ].join("\n");

  try {
    const candidate = await runToolCodeGeneration(client, modelId, systemPrompt, baseUserMessage, onProgress);
    if (!candidate) return null;

    const evaluation = scoreGeneratedCode({
      code: candidate.generated_code,
      prompt: originalPrompt,
      outputFormat: intent.output_format_hint,
    });

    const pipelineArtifact: PipelineRunArtifact = {
      run_id: randomUUID(),
      stages: [
        "Research & Planning",
        "Code Generation",
        "Quality Scoring",
        "Finalize",
      ],
      selected_candidate: "A",
      candidates: [
        {
          id: "A",
          quality_score: evaluation.quality_score,
          quality_breakdown: evaluation.quality_breakdown,
        },
      ],
      repaired: false,
    };

    const result: CodeGenerationResult = {
      ...candidate,
      quality_score: evaluation.quality_score,
      quality_breakdown: evaluation.quality_breakdown,
      pipeline_artifact: pipelineArtifact,
    };
    console.log(
      `Code generation success: ${result.app_name}, ${result.generated_code.length} chars, score ${result.quality_score}`,
    );
    return result;
  } catch (e) {
    console.error("Code generation failed:", e);
    return null;
  }
}
