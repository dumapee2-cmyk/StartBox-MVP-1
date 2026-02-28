import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { ReasonedIntent } from "./reasoner.js";
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
/*  System prompt — design-system-driven code generation                */
/* ------------------------------------------------------------------ */

const LAYOUT_GUIDES: Record<string, string> = {
  analyzer: `ANALYZER LAYOUT:
Tab 1 (Home): Hero gradient (bg with __sb.color(P,0.15) to transparent) with icon + name + tagline -> glass-elevated input card (textarea.glass-input + option pills row) -> glass-btn glass-btn-primary glass-btn-lg w-full
Tab 2 (Results): Score display (text-4xl font-bold with accent color) -> grid grid-cols-2 of sb-card breakdown items -> action row (copy, share buttons)
Tab 3 (History): sb-list-item rows with sb-avatar + title + sb-tag status + date`,
  generator: `GENERATOR LAYOUT:
Tab 1 (Create): Hero section -> glass-elevated card (textarea.glass-input + style/tone pills) -> glass-btn glass-btn-primary
Tab 2 (Output): glass-elevated result card with formatted output + copy/regenerate buttons`,
  tool: `TOOL LAYOUT:
Tab 1 (Main): Hero -> glass-elevated card with sb-form-group stacked inputs -> Result card (text-4xl font-bold value centered, accent glow)
Tab 2 (History): sb-list-item rows of past calculations`,
  dashboard: `DASHBOARD LAYOUT:
Tab 1 (Overview): grid grid-cols-2 lg:grid-cols-4 gap-3 of sb-stat cards -> glass-elevated activity feed (sb-list-item rows with sb-avatar)
Tab 2 (Details): sb-table with data or glass-elevated breakdown cards`,
  planner: `PLANNER LAYOUT:
Tab 1 (Plan): sb-progress header (day X of Y) -> sb-card items with colored left border + checkboxes + sb-tag status -> Add button
Tab 2 (History): Timeline with date groups`,
};

const DEMO_HINTS: Record<string, string> = {
  analyzer: 'Show pre-computed result: score 87/100 (text-4xl accent), 4 breakdown sb-stat cards, 3 history sb-list-item rows with sb-avatar + sb-tag status + date.',
  generator: 'Show 2 pre-generated outputs as sb-card items. Copy button per output. Include word count.',
  tool: 'Pre-filled realistic input in sb-form-group fields. Result displayed immediately as text-4xl accent number.',
  dashboard: '4 sb-stat cards (grid-cols-2 lg:grid-cols-4) with realistic numbers + sb-stat-change.up/.down, 3-5 sb-list-item rows with sb-avatar.',
  planner: 'Day 3 of 14, sb-progress at 21%. 4+ sb-card items with colored left border, checkboxes, sb-tag status.',
};

function buildCodeGenSystemPrompt(layout: string): string {
  const layoutGuide = LAYOUT_GUIDES[layout] ?? LAYOUT_GUIDES.analyzer;
  const demoHint = DEMO_HINTS[layout] ?? DEMO_HINTS.analyzer;

  return `You build premium dark-theme web apps. Quality bar: Linear, Raycast, Vercel dashboard.
NO imports. NO JSX. All rendering via h(). Tailwind classes only. ZERO emoji anywhere.

CRITICAL — CODE MUST BE SYNTACTICALLY VALID:
- Every h() call must have balanced parentheses. Count your parens.
- Every object literal must have balanced braces.
- Every array must have balanced brackets.
- End the file with: ReactDOM.createRoot(document.getElementById('root')).render(h(App));
- Do NOT leave trailing commas before closing parens/brackets.
- Before returning, mentally verify all brackets/parens are balanced.

MANDATORY FIRST LINES (copy exactly, replace values):
const h = React.createElement;
const {useState,useEffect,useRef,useCallback,useMemo} = React;
const {/* needed Lucide icons */} = window.LucideReact || {};
const I = ({icon:C,...p}) => C ? h(C,{size:18,strokeWidth:1.5,...p}) : null;
const cn = window.__sb.cn;
const P = '#HEX_COLOR';
document.documentElement.style.setProperty('--sb-primary',P);
document.documentElement.style.setProperty('--sb-primary-glow',window.__sb.color(P,0.2));
document.documentElement.style.setProperty('--sb-primary-bg',window.__sb.color(P,0.12));
// LAST LINE: ReactDOM.createRoot(document.getElementById('root')).render(h(App));

DESIGN SYSTEM (pre-loaded CSS — use these classes, NEVER recreate with inline styles):
Surfaces: "glass" | "glass-elevated" (hero/main cards) | "glass-hover"
Inputs: "glass-input" | textarea: className "glass-input"
Buttons: "glass-btn glass-btn-primary" | "glass-btn glass-btn-secondary" | add "glass-btn-lg"
Cards: "sb-card" | "sb-stat" (with .sb-stat-value, .sb-stat-label, .sb-stat-change.up/.down)
Nav: "sb-nav" + "sb-nav-brand" + "sb-nav-tabs" + "sb-nav-tab" / cn("sb-nav-tab", active && "active")
Lists: "sb-list-item" (flex row + hover)
Badges: "sb-badge" | "sb-badge-primary" (pill)
Tags: "sb-tag" | "sb-tag-success" | "sb-tag-warning" | "sb-tag-error" | "sb-tag-primary" (status labels)
Tables: "sb-table" + "sb-th" + "sb-td"
Forms: "sb-form-group" (label + input + .sb-helper text)
Search: "sb-search" wrapping glass-input + "sb-search-icon"
Progress: "sb-progress" + "sb-progress-fill" (set width via style)
Avatar: "sb-avatar" (32px circle — set bg/color via style for themed look)
Toggle: cn("sb-toggle", isOn && "on") (iOS switch)
Empty: "sb-empty" (centered icon + message)
Loading: "sb-skeleton" (shimmer)
Divider: "sb-divider"
Stagger: "sb-stagger" on parent — children auto-animate in sequence

COLOR: var(--sb-primary) for accent. window.__sb.color(P,0.15) for bg tints, 0.3 for glows.
TYPOGRAPHY: text-xs (captions) | text-sm (secondary) | text-base (body) | text-lg (subheadings) | text-2xl (titles) | text-4xl font-bold tracking-tight (hero numbers). Colors: text-white | text-white/60 | text-white/40 | text-white/25.
SPACING: p-4 (cards) | gap-3 (grids) | py-6 (sections) | px-5 (page). max-w-2xl mx-auto (focused) | max-w-5xl (dashboards).

SDK (pre-loaded — ALWAYS use):
- window.__sb.useStore(key, default) — localStorage hook. NEVER manual localStorage.
- window.__sb.copy(text) — clipboard + toast
- window.__sb.toast(msg, 'success'|'error'|'info')
- window.__sb.fmt.date(d), .time(d), .number(n), .currency(n), .percent(n), .relative(d)
- window.__sb.color(hex, opacity) — rgba from hex
- window.__sb.cn(...args) — className joiner: cn('a', cond && 'b') => 'a b' or 'a'
- AI calls: await window.__sbAI(systemPrompt, userMessage)

ANIMATIONS: fadeIn, slideUp, slideDown, scaleIn, shimmer, countUp, fillRight, ringFill, pulse, spin, glow
Use "sb-stagger" on parent OR style={{animation:'slideUp 0.4s ease-out '+(i*0.06)+'s both'}}

--- REFERENCE EXAMPLE (study this, then adapt for the user's app) ---
const h = React.createElement;
const {useState,useCallback} = React;
const {Search,Star,TrendingUp,Clock,ChevronRight,Settings,Inbox} = window.LucideReact || {};
const I = ({icon:C,...p}) => C ? h(C,{size:18,strokeWidth:1.5,...p}) : null;
const cn = window.__sb.cn;
const P = '#6366f1';
document.documentElement.style.setProperty('--sb-primary',P);
document.documentElement.style.setProperty('--sb-primary-glow',window.__sb.color(P,0.2));
document.documentElement.style.setProperty('--sb-primary-bg',window.__sb.color(P,0.12));

const DEMO = [
  {id:1,name:'Q4 Revenue Report',status:'complete',score:94,date:'2025-12-15'},
  {id:2,name:'Marketing Campaign',status:'in_progress',score:67,date:'2025-12-18'},
  {id:3,name:'User Onboarding',status:'review',score:82,date:'2025-12-20'},
  {id:4,name:'API Documentation',status:'complete',score:91,date:'2025-12-22'},
];

const Stat = ({label,value,change}) => h('div',{className:'sb-stat'},
  h('div',{className:'sb-stat-label'},label),
  h('div',{className:'sb-stat-value'},value),
  change ? h('div',{className:cn('sb-stat-change',change>0?'up':'down')},(change>0?'+':'')+change+'%') : null);

const Row = ({item}) => h('div',{className:'sb-list-item glass-hover'},
  h('div',{className:'sb-avatar',style:{background:window.__sb.color(P,0.15),color:P}},item.name[0]),
  h('div',{className:'flex-1 min-w-0'},
    h('div',{className:'text-sm font-medium text-white truncate'},item.name),
    h('div',{className:'text-xs text-white/40'},window.__sb.fmt.date(item.date))),
  h('span',{className:cn('sb-tag',item.status==='complete'?'sb-tag-success':'sb-tag-warning')},item.status.replace('_',' ')),
  h(I,{icon:ChevronRight,size:14,className:'text-white/20'}));

function App(){
  const [page,setPage] = useState('overview');
  const [items,setItems] = window.__sb.useStore('demo_items',DEMO);
  const [search,setSearch] = useState('');
  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  const nav = h('nav',{className:'sb-nav'},
    h('div',{className:'sb-nav-brand'},
      h('div',{className:'flex items-center justify-center w-8 h-8 rounded-lg',style:{background:window.__sb.color(P,0.15)}},
        h(I,{icon:Star,style:{color:P}})),'DemoApp'),
    h('div',{className:'sb-nav-tabs'},
      ['overview','items','settings'].map(t=>
        h('button',{key:t,className:cn('sb-nav-tab',page===t&&'active'),onClick:()=>setPage(t)},
          t.charAt(0).toUpperCase()+t.slice(1)))));

  const content = {
    overview: h('div',{className:'sb-stagger'},
      h('div',{className:'grid grid-cols-2 lg:grid-cols-4 gap-3'},
        h(Stat,{label:'Total Items',value:window.__sb.fmt.number(items.length),change:12}),
        h(Stat,{label:'Completed',value:items.filter(i=>i.status==='complete').length+''}),
        h(Stat,{label:'Avg Score',value:Math.round(items.reduce((a,i)=>a+i.score,0)/items.length)+''}),
        h(Stat,{label:'This Week',value:'8',change:-3})),
      h('div',{className:'glass-elevated p-4 mt-4'},
        h('div',{className:'text-lg font-semibold text-white mb-3'},'Recent Activity'),
        h('div',{className:'flex flex-col gap-1'},items.slice(0,4).map(i=>h(Row,{key:i.id,item:i}))))),
    items: h('div',{className:'space-y-3'},
      h('div',{className:'flex items-center gap-3'},
        h('div',{className:'sb-search flex-1'},
          h('input',{className:'glass-input',placeholder:'Search...',value:search,onChange:e=>setSearch(e.target.value)}),
          h('div',{className:'sb-search-icon'},h(I,{icon:Search}))),
        h('button',{className:'glass-btn glass-btn-primary'},'Add New')),
      filtered.length ? h('div',{className:'glass-elevated p-0'},filtered.map((i,idx)=>
        h('div',{key:i.id,className:cn('sb-list-item',idx<filtered.length-1&&'border-b border-white/[0.04]')},
          h('div',{className:'sb-avatar',style:{background:window.__sb.color(P,0.15),color:P}},i.name[0]),
          h('div',{className:'flex-1'},h('div',{className:'text-sm font-medium text-white'},i.name)),
          h('span',{className:cn('sb-tag',i.status==='complete'?'sb-tag-success':'sb-tag-warning')},i.status.replace('_',' ')))))
        : h('div',{className:'sb-empty'},h(I,{icon:Inbox,size:32}),h('div',null,'No items match your search'))),
    settings: h('div',{className:'glass-elevated p-5 max-w-lg mx-auto space-y-4'},
      h('div',{className:'text-lg font-semibold text-white'},'Settings'),
      h('div',{className:'sb-form-group'},h('label',null,'Display Name'),h('input',{className:'glass-input',defaultValue:'Demo User'})),
      h('div',{className:'flex items-center justify-between'},h('span',{className:'text-sm text-white/60'},'Notifications'),h('button',{className:'sb-toggle on'}))),
  };

  return h('div',{className:'min-h-screen bg-[#09090b]'},nav,
    h('div',{className:'max-w-5xl mx-auto px-5 py-6'},content[page]||content.overview));
}
ReactDOM.createRoot(document.getElementById('root')).render(h(App));
--- END REFERENCE ---

REQUIRED APP STRUCTURE (follow this pattern):
function App(){
  const [page,setPage] = useState('FIRST_TAB_ID');
  // state, data, handlers...
  const nav = h('nav',{className:'sb-nav'}, brand, tabs);
  const content = { tabId: h('div',...), ... };  // object keyed by tab IDs
  return h('div',{className:'min-h-screen bg-[#09090b]'}, nav,
    h('div',{className:'max-w-5xl mx-auto px-5 py-6'}, content[page] || content.FIRST_TAB));
}

${layoutGuide}

DEMO DATA (CRITICAL — app must look fully functional on first render):
${demoHint}
Create 3-5 realistic objects as const array. Each has: id, name/title, status/category, numeric value, date.
Use DOMAIN-SPECIFIC terminology (fitness: reps/sets/weight; clipboard: content/source/type; finance: amount/category/date).
First tab MUST show meaningful content. NEVER empty on first render.

STATES: Every feature needs: default -> loading (sb-skeleton) -> result -> error. Never leave a screen empty.
AVOID: emoji, light backgrounds, bottom/sidebar nav, dark text on dark bg, generic placeholders, "Powered by AI".`;
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

function classifyComponent(name: string): string {
  if (name === 'App') return 'pages/App';
  if (/Nav|Header|Footer|Sidebar|Layout|TopBar/i.test(name)) return `components/layout/${name}`;
  if (/Card|List|Grid|Item|Badge|Tag|Chip|Row|Cell/i.test(name)) return `components/ui/${name}`;
  if (/Modal|Dialog|Popup|Drawer|Sheet|Toast/i.test(name)) return `components/overlay/${name}`;
  if (/Score|Ring|Chart|Graph|Meter|Gauge/i.test(name)) return `components/data/${name}`;
  return `components/${name}`;
}

async function runToolCodeGeneration(
  client: Anthropic,
  modelId: string,
  systemPrompt: string,
  userMessage: string,
  onProgress?: ProgressCallback,
): Promise<CodeGenerationResult | null> {
  const timeoutMs = Number(process.env.STARTBOX_CODEGEN_TIMEOUT_MS ?? 300000);

  // Use streaming with AbortController so timeouts actually cancel the request
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const stream = client.messages.stream({
      model: modelId,
      max_tokens: 16000,
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

    // Hook into streaming to detect components + emit progress milestones in real-time
    const detectedComponents = new Set<string>();
    const componentPattern = /function\s+([A-Z][A-Za-z0-9]+)\s*\(/g;
    const constComponentPattern = /const\s+([A-Z][A-Za-z0-9]+)\s*=\s*(?:\(|function)/g;

    // Character-count milestones — distributed across the build timeline
    const charMilestones: Array<{ threshold: number; message: string; fired: boolean }> = [
      { threshold: 200, message: "Initializing project structure...", fired: false },
      { threshold: 1500, message: "Compiling component modules...", fired: false },
      { threshold: 4000, message: "Linking interactive elements...", fired: false },
      { threshold: 7000, message: "Bundling data layer...", fired: false },
      { threshold: 10000, message: "Optimizing render pipeline...", fired: false },
      { threshold: 13000, message: "Running final build pass...", fired: false },
    ];

    // Pattern-based milestones — contextual events when specific code patterns appear
    const patternMilestones: Array<{ pattern: RegExp; message: string; fired: boolean }> = [
      { pattern: /useState/, message: "Wiring up state hooks...", fired: false },
      { pattern: /LucideReact/, message: "Bundling icon assets...", fired: false },
      { pattern: /__sbAI/, message: "Mounting smart modules...", fired: false },
      { pattern: /useEffect/, message: "Registering lifecycle hooks...", fired: false },
      { pattern: /localStorage|useStore/, message: "Configuring local storage...", fired: false },
      { pattern: /animation|animate|keyframes/i, message: "Compiling animations...", fired: false },
    ];

    stream.on('inputJson', (_delta: string, snapshot: unknown) => {
      if (!onProgress) return;
      const snap = snapshot as Record<string, unknown>;
      const code = typeof snap?.generated_code === 'string' ? snap.generated_code : '';
      if (!code) return;

      // Emit character-count milestones
      for (const m of charMilestones) {
        if (!m.fired && code.length >= m.threshold) {
          m.fired = true;
          onProgress({ type: 'writing', message: m.message, data: { milestone: true } });
        }
      }

      // Emit pattern-based milestones
      for (const m of patternMilestones) {
        if (!m.fired && m.pattern.test(code)) {
          m.fired = true;
          onProgress({ type: 'writing', message: m.message, data: { milestone: true } });
        }
      }

      // Detect function components
      componentPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = componentPattern.exec(code)) !== null) {
        const name = match[1];
        if (!detectedComponents.has(name)) {
          detectedComponents.add(name);
          const path = classifyComponent(name);
          onProgress({ type: 'writing', message: `Wrote ${path}`, data: { component: name, path } });
        }
      }

      // Detect const arrow components
      constComponentPattern.lastIndex = 0;
      while ((match = constComponentPattern.exec(code)) !== null) {
        const name = match[1];
        if (!detectedComponents.has(name)) {
          detectedComponents.add(name);
          const path = classifyComponent(name);
          onProgress({ type: 'writing', message: `Wrote ${path}`, data: { component: name, path } });
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
      onProgress?.({ type: 'status', message: 'Extracting build output...' });
    }

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      console.error("No tool_use block in response. stop_reason:", response.stop_reason, "content types:", response.content.map(b => b.type));
      onProgress?.({ type: 'status', message: 'Retrying build extraction...' });
      return null;
    }

    const raw = toolUse.input as CodeGenerationResult;
    const cleanCode = cleanGeneratedCode(raw.generated_code ?? "");
    if (!cleanCode) {
      console.error("Code generation produced empty code after cleaning. Raw length:", (raw.generated_code ?? "").length);
      return null;
    }
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

  const tabList = intent.nav_tabs.map(t =>
    `  ${t.id}: "${t.label}" (icon: ${t.icon}, layout: ${t.layout}) — ${t.purpose}`
  ).join("\n");

  const featureDetails = (intent.feature_details ?? []).map(f =>
    `  - ${f.name}: ${f.description}`
  ).join("\n");

  const baseUserMessage = [
    `Build: "${originalPrompt}"`,
    `App: ${intent.app_name_hint} | Color: ${intent.primary_color} | Icon: ${intent.app_icon}`,
    `Domain: ${intent.domain} | Goal: ${intent.primary_goal}`,
    `Design: ${intent.design_philosophy}`,
    ``,
    `TABS (use these exact IDs for page state):`,
    tabList,
    `Default tab: "${intent.nav_tabs[0]?.id ?? 'home'}"`,
    ``,
    `FEATURES:`,
    featureDetails || `  - ${intent.premium_features?.join("\n  - ") ?? "standard"}`,
    ``,
    `Output format: ${intent.output_format_hint} | Primary layout: ${primaryLayout.toUpperCase()}`,
  ].join("\n");

  try {
    const candidate = await runToolCodeGeneration(client, modelId, systemPrompt, baseUserMessage, onProgress);
    if (!candidate) {
      console.error("Code generation returned null — no usable output from API");
      onProgress?.({ type: 'status', message: 'Build failed — retrying is recommended' });
      return null;
    }

    onProgress?.({ type: 'status', message: 'Running quality checks...' });

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
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Code generation failed:", msg);
    onProgress?.({ type: 'status', message: `Build error: ${msg.slice(0, 100)}` });
    return null;
  }
}
