import Anthropic from "@anthropic-ai/sdk";
import type { ReasonedIntent } from "./reasoner.js";

export interface CodeGenerationResult {
  generated_code: string;
  app_name: string;
  tagline: string;
  primary_color: string;
  icon: string;
  pages: string[];
}

const CODE_GEN_SYSTEM_PROMPT = `You are an elite React developer at a top-tier product studio. Generate a COMPLETE, SINGLE-FILE React application that would earn $29/mo in production.

ABSOLUTE RULES:
1. NO import statements — use global destructuring only:
   const { useState, useEffect, useRef, useCallback, useMemo } = React;
2. Icons: const { Search, Star, ArrowRight, Zap, ChevronRight, Upload, Download, Copy, Check, X, Plus, Minus, BarChart2, FileText, Settings, Home, History, RefreshCw, Loader2 } = window.LucideReact || {};
   Always add a fallback: const IconComponent = window.LucideReact?.IconName || null;
   Render icons with: {IconComponent ? React.createElement(IconComponent, { size: 20 }) : '→'}
3. Tailwind CSS classes ONLY — no style attributes except for dynamic colors via style prop
4. AI calls: const result = await window.__sbAI(SYSTEM_PROMPT_STRING, userMessage);
5. Multiple pages via state: const [page, setPage] = useState('home');
6. LAST LINE MUST BE: ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
7. Include real loading spinners, error boundaries, optimistic UI
8. Every button and nav item MUST be wired up and functional
9. Include realistic demo data visible on FIRST LOAD (not empty states)
10. App must look like a polished SaaS product

STRUCTURE — determined by layout_archetype in the user message:

IF layout_archetype === "tabbed_tool":
  - Sticky header: Logo/icon, app name, horizontal tab navigation, optional settings gear
  - 2-4 tab pages: main tool, results/history, settings
  - Each tab: form → AI trigger → results display
  - History stored in localStorage as clickable cards
  - Reference: Cal AI, MyFitnessPal, Grammarly

IF layout_archetype === "sidebar_dashboard":
  - Left sidebar (w-64, bg-gray-900 or bg-slate-800): app icon/name at top, nav links with icons, settings at bottom
  - Main content area: metric cards row at top (3-4 stats), then primary content below
  - Active nav item highlighted with accent color in sidebar
  - No horizontal tab bar — all navigation is in the sidebar
  - Reference: Notion, Linear, Stripe Dashboard, Vercel Dashboard

IF layout_archetype === "card_grid":
  - Hero section at top: headline, subtitle, search/filter bar
  - Category filter tabs or pills above the grid
  - Masonry or uniform grid of cards (3-4 columns desktop, 1 mobile)
  - Cards are interactive: click to expand, flip, or show detail modal
  - Each card has: title, preview content, category tag, action button
  - Reference: Pinterest, Quizlet, Dribbble, Product Hunt

IF layout_archetype === "split_pane":
  - Thin top bar: app name + settings icon
  - Two columns (50/50 or 40/60): left = input panel with form, right = output/preview panel
  - Output updates live on button click (or debounced typing)
  - Clear visual divider between panes (border or subtle background change)
  - No tab navigation — everything visible at once
  - Reference: CodePen, Google Translate, Markdown editors

IF layout_archetype === "wizard_stepper":
  - Progress indicator at top: numbered step dots or labeled progress bar
  - One step visible at a time, content centered in viewport (max-w-xl mx-auto)
  - Back/Next buttons fixed at bottom of each step
  - Steps: 2-4 input steps collecting different info, then final step shows AI results
  - Final step has: restart button, save/copy result, rich formatted output
  - Reference: TurboTax, Typeform, onboarding flows

IF layout_archetype === "chat_interface":
  - Message list taking ~80% of height, auto-scrolls to bottom
  - Input bar fixed at bottom: textarea + send button, optional attachments
  - Optional collapsible right sidebar (w-72) for context, settings, or saved items
  - User messages: right-aligned, primary color bg, white text
  - AI messages: left-aligned, gray bg, with structured formatting
  - Typing indicator during AI processing
  - Reference: ChatGPT, Claude, Intercom

IF layout_archetype === "kanban_board":
  - Top bar: app name, search, add new item button
  - Horizontal scrolling board with 3-5 columns
  - Each column: header with count, list of cards, "Add card" button at bottom
  - Cards: title + brief details + category/priority tag + click to show detail modal
  - Detail modal: full info, edit fields, move between columns
  - Reference: Trello, Linear, Notion Board view

IF layout_archetype === "landing_hero":
  - Large hero section: big headline (text-4xl+), subtitle, prominent CTA button with primary color
  - Features section below: 2-3 column grid of feature cards with icons
  - Single scrolling page, NO tab navigation, NO sidebar
  - CTA triggers the main AI action; results appear in-place below the hero
  - After results: formatted display with copy button, "Try again" button
  - Reference: Stripe, Vercel, Linear marketing pages

CRITICAL: The layout_archetype determines the ENTIRE page structure. Do NOT add tab navigation to a sidebar_dashboard. Do NOT add a sidebar to a tabbed_tool. Do NOT add horizontal tabs to a split_pane. Follow the archetype strictly.

AI INTEGRATION PATTERNS (pick the best for the domain):
- Analyzer: User inputs → "Analyzing..." spinner → Structured results with score/grade/breakdown
- Generator: User inputs → "Generating..." → Long-form content display with copy button
- Planner: User inputs goals → "Planning..." → Step-by-step action plan
- Advisor: Chat-like interface → AI responds with recommendations

AI RESULT DISPLAY:
Always parse AI response for structure. The AI_SYSTEM_PROMPT must instruct Claude to respond in a parseable format:
- For scores: "**Score: 87/100**\\n**Grade: B+**\\n## Category\\n**Key:** Value"
- For lists: "1. Item\\n2. Item"
- For content: Rich markdown with ## headers and **bold** key points

STYLING REQUIREMENTS (use these exact patterns):
- Primary color: use the provided hex via inline style on key accent elements, Tailwind arbitrary values for backgrounds
- Dark sidebar or top nav: bg-gray-900 or bg-slate-800
- Cards: bg-white rounded-xl shadow-sm border border-gray-100
- Inputs: w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2
- Primary button: px-6 py-3 rounded-lg text-white font-semibold (bg via inline style with primary color)
- Loading: flex items-center gap-2 with animate-spin div
- Score ring: SVG circle with strokeDasharray/strokeDashoffset for animated fill

HISTORY FEATURE (for archetypes that support it — tabbed_tool, sidebar_dashboard, chat_interface):
Store results in localStorage as JSON array. Load on mount. Display as clickable cards or list items.

localStorage pattern:
const STORAGE_KEY = 'APP_NAME_history';
const [history, setHistory] = useState(() => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
});

COPY TO CLIPBOARD:
Always include copy buttons for generated content:
const [copied, setCopied] = useState(false);
async function handleCopy(text) {
  await navigator.clipboard.writeText(text).catch(() => {});
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
}

ERROR HANDLING:
Always wrap AI calls in try/catch. Show friendly error messages in a styled error banner.

REFERENCE IMPLEMENTATIONS (archetype → example):
1. Food Scanner (tabbed_tool): Tab nav → photo/text input → Macro score ring + breakdown
2. Resume Checker (split_pane): Left: paste resume + job desc. Right: live ATS score + keyword gaps
3. Email Writer (split_pane): Left: bullet points + tone. Right: live email preview with copy
4. Business Validator (wizard_stepper): Step 1: idea desc → Step 2: target market → Step 3: AI viability report
5. Caption Generator (card_grid): Hero + platform filter → Grid of caption variants as cards
6. Study Planner (sidebar_dashboard): Sidebar with subjects → Main: calendar view + study schedule
7. Pricing Calculator (tabbed_tool): Tab 1: inputs form → Tab 2: competitive analysis
8. Code Reviewer (split_pane): Left: paste code. Right: quality score + annotated feedback
9. Project Manager (kanban_board): Columns: Backlog / In Progress / Review / Done
10. AI Tutor (chat_interface): Message thread + side panel with topic outline

FINAL CHECKLIST before outputting:
✓ No import statements
✓ Uses window.LucideReact with fallback
✓ Layout matches the specified layout_archetype
✓ No tab navigation in non-tabbed layouts
✓ No sidebar in non-sidebar layouts
✓ AI call uses window.__sbAI
✓ Primary color applied to CTAs and accents
✓ Demo data visible on first load
✓ ReactDOM.createRoot at bottom
✓ Error handling on AI calls
✓ Mobile responsive (flex-col on mobile, side-by-side on md+)`;

const codeGenToolSchema = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    generated_code: {
      type: "string",
      description: "The complete single-file React JSX application code",
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
      description: "Single emoji representing the app",
    },
    pages: {
      type: "array",
      items: { type: "string" },
      description: "List of page/tab names in the app",
    },
  },
  required: ["generated_code", "app_name", "tagline", "primary_color", "icon", "pages"],
};

export async function generateReactCode(
  intent: ReasonedIntent,
  originalPrompt: string,
  model: "sonnet" | "opus" = "sonnet",
): Promise<CodeGenerationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const modelId =
    model === "opus" ? "claude-opus-4-6" : "claude-sonnet-4-6";

  const userMessage = [
    `Build a complete, production-ready React app for this product:`,
    ``,
    `User prompt: "${originalPrompt}"`,
    `App concept: ${intent.primary_goal}`,
    `Domain: ${intent.domain}`,
    `Design style: ${intent.design_philosophy}`,
    `Layout archetype: ${intent.layout_archetype}`,
    `Reference app: ${intent.reference_app ?? "none"}`,
    `App name: ${intent.app_name_hint}`,
    `Primary color: ${intent.primary_color}`,
    `Theme: ${intent.theme_style}`,
    `Icon: ${intent.app_icon}`,
    `Pages needed: ${intent.nav_tabs.map((t) => t.label).join(", ")}`,
    `Output style: ${intent.output_format_hint}`,
    ``,
    `Generate a complete single-file React app. The primary color is ${intent.primary_color} — use it for CTAs, active states, score rings, and accents. Include real demo data visible on first load. Make it look like a $29/mo SaaS product.`,
    ``,
    `The AI system prompt inside the app MUST produce structured output that matches the output style (${intent.output_format_hint}). Design the prompt carefully so users get rich, parseable results.`,
  ].join("\n");

  try {
    const response = await client.messages.create({
      model: modelId,
      max_tokens: 16000,
      system: CODE_GEN_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      tools: [
        {
          name: "generate_react_app",
          description:
            "Generate a complete, single-file React application with all features",
          input_schema: codeGenToolSchema,
        },
      ],
      tool_choice: { type: "tool", name: "generate_react_app" },
    });

    if (response.stop_reason === "max_tokens") {
      console.warn("Code generation hit max_tokens limit — output may be truncated");
    }

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      console.error("Code generation: no tool_use block in response. stop_reason:", response.stop_reason);
      return null;
    }

    const raw = toolUse.input as CodeGenerationResult;
    // Strip markdown code fences if Claude wrapped the code despite being told not to
    const cleanCode = (raw.generated_code ?? "")
      .replace(/^```(?:jsx?|tsx?|javascript)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();

    if (!cleanCode) {
      console.error("Code generation: tool returned empty generated_code");
      return null;
    }

    const result: CodeGenerationResult = { ...raw, generated_code: cleanCode };
    console.log(`Code generation success: ${result.app_name}, ${result.generated_code.length} chars`);
    return result;
  } catch (e) {
    console.error("Code generation failed:", e);
    return null;
  }
}
