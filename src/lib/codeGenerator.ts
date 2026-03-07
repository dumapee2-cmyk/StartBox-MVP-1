import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReasonedIntent } from "./reasoner.js";
import { scoreGeneratedCode } from "./qualityScorer.js";
import { recordSpend, calculateCost } from "./costTracker.js";
import type { ProgressCallback } from "./progressEmitter.js";
import type { PipelineRunArtifact, QualityBreakdown } from "../types/index.js";
import { resolveModel } from "./modelResolver.js";
import { extractJSON, extractCodeFromFences, extractTextFromResponse, llmLog } from "./llmCompat.js";
import { buildCodegenSystemPrompt, buildRepairSystemPrompt } from "./prompts/codegenPrompt.js";

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
/*  Icon sanitization helpers                                           */
/* ------------------------------------------------------------------ */

const LUCIDE_DECLARATION_REGEX = /(const|let|var)\s*\{([^}]+)\}\s*=\s*window\.(LucideReact|lucideReact)\s*\|\|\s*\{\}\s*;?/;
const SVG_NATIVE_ICON_EXCLUSIONS = new Set([
  'Circle', 'Rect', 'Path', 'Line', 'Text', 'G', 'Defs', 'Symbol', 'Use',
  'Polygon', 'Polyline', 'Ellipse', 'ClipPath', 'LinearGradient',
  'RadialGradient', 'Stop', 'Mask', 'Pattern', 'ForeignObject', 'Svg', 'TSpan', 'TextPath',
]);

function sanitizeIconDestructuring(code: string): string {
  return code.replace(
    LUCIDE_DECLARATION_REGEX,
    (_match, declKind: string, iconList: string, lucideGlobal: string) => {
      const icons = iconList.split(',').map((s: string) => s.trim()).filter(Boolean);
      const fixedIcons: string[] = [];
      for (const icon of icons) {
        const parts = icon.split(/\s+as\s+/);
        const baseName = parts[0].trim();
        if (!baseName) continue;
        if (parts.length > 1) {
          fixedIcons.push(`${baseName}: ${parts[1].trim()}`);
        } else {
          fixedIcons.push(baseName);
        }
      }
      if (fixedIcons.length === 0) fixedIcons.push('Star');
      return `${declKind} {${fixedIcons.join(', ')}} = window.${lucideGlobal} || {};`;
    }
  );
}

function extractLikelyIconRefs(code: string): string[] {
  const jsxTags = [...new Set((code.match(/<([A-Z][a-zA-Z0-9]+)[\s/>]/g) || []).map((t) => t.slice(1, -1)))];
  const definedComponents = new Set(
    (code.match(/(?:function|const)\s+([A-Z][a-zA-Z0-9]+)/g) || []).map((m) => m.split(/\s+/).pop() ?? ''),
  );
  return jsxTags.filter((name) => !definedComponents.has(name) && name !== 'App' && !SVG_NATIVE_ICON_EXCLUSIONS.has(name));
}

function reconcileIconDestructuring(code: string): string {
  const likelyIcons = extractLikelyIconRefs(code);
  if (likelyIcons.length === 0) return code;

  const declarationMatch = code.match(LUCIDE_DECLARATION_REGEX);
  if (!declarationMatch) {
    console.warn(`Auto-injecting LucideReact destructuring for: ${likelyIcons.join(', ')}`);
    return `const {${likelyIcons.join(', ')}} = window.LucideReact || {};\n${code}`;
  }

  const declarationKind = declarationMatch[1] ?? 'const';
  const lucideGlobal = declarationMatch[3] ?? 'LucideReact';

  const declaredEntries = declarationMatch[2]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const declaredVars = new Set<string>();
  for (const entry of declaredEntries) {
    const parts = entry.split(':').map((part) => part.trim());
    if (parts[1]) {
      declaredVars.add(parts[1]);
    } else if (parts[0]) {
      declaredVars.add(parts[0]);
    }
  }

  const missing = likelyIcons.filter((icon) => !declaredVars.has(icon));
  if (missing.length === 0) return code;

  console.warn(`Appending missing Lucide icons to destructuring: ${missing.join(', ')}`);
  const nextEntries = [...declaredEntries];
  for (const icon of missing) {
    if (!nextEntries.includes(icon)) nextEntries.push(icon);
  }

  return code.replace(
    LUCIDE_DECLARATION_REGEX,
    `${declarationKind} {${nextEntries.join(', ')}} = window.${lucideGlobal} || {};`,
  );
}

/* ------------------------------------------------------------------ */
/*  Code cleaning & validation                                          */
/* ------------------------------------------------------------------ */

export function cleanGeneratedCode(rawCode: string): string {
  let code = (rawCode ?? "").trim();

  // STEP 0: If text contains markdown fences, extract ONLY the fenced code content.
  const fencedCode = extractCodeFromFences(code);
  if (fencedCode) {
    code = fencedCode;
  } else {
    // No fences found — strip any preamble text before the actual code starts.
    const codeStartMatch = code.match(/^(const |let |var |function |\/\/|\/\*|<[A-Z])/m);
    if (codeStartMatch && codeStartMatch.index && codeStartMatch.index > 0) {
      const preamble = code.slice(0, codeStartMatch.index);
      if (/[a-zA-Z]\s+[a-zA-Z]/.test(preamble)) {
        console.log(`[cleanGeneratedCode] stripping ${preamble.length}-char preamble before code`);
        code = code.slice(codeStartMatch.index);
      }
    }
  }

  // Strip residual fence markers
  code = code
    .replace(/^```(?:jsx?|tsx?|javascript)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  // Strip import/export statements
  code = code.replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  code = code.replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '');
  code = code.replace(/^export\s+(default\s+)?/gm, '');

  // Strip TypeScript syntax
  code = code.replace(/^(?:export\s+)?interface\s+\w+\s*\{[^}]*\}\s*;?\s*$/gm, '');
  code = code.replace(/^(?:export\s+)?type\s+\w+\s*=\s*[^;]+;\s*$/gm, '');
  code = code.replace(/(use(?:State|Ref|Callback|Memo|Reducer))<[^>]+>/g, '$1');
  code = code.replace(/:\s*React\.(?:FC|FunctionComponent)(?:<[^>]*>)?\s*=/g, ' =');

  // Fix icon destructuring syntax
  code = sanitizeIconDestructuring(code);

  // Fix bare SDK calls
  code = code.replace(/(?<!\w)(?<!__sb\.)(?<!window\.__sb\.)useStore\s*\(/g, 'window.__sb.useStore(');
  code = code.replace(/(?<!\w)(?<!__sb\.)(?<!window\.__sb\.)toast\s*\(/g, 'window.__sb.toast(');

  // Ensure React destructuring exists
  if (code.length > 200 && !code.includes('= React') && !code.includes('React.useState')) {
    const usedHooks = ['useState', 'useEffect', 'useRef', 'useCallback', 'useMemo', 'useReducer']
      .filter(h => code.includes(h));
    if (usedHooks.length > 0) {
      console.warn(`Auto-injecting React destructuring for: ${usedHooks.join(', ')}`);
      code = `const {${usedHooks.join(', ')}} = React;\n${code}`;
    }
  }

  // Ensure LucideReact destructuring includes all used icon refs
  code = reconcileIconDestructuring(code);

  // Ensure cn helper exists if used
  if (code.includes('cn(') && !code.includes('const cn') && !code.includes('= window.__sb.cn')) {
    code = `const cn = window.__sb.cn;\n${code}`;
  }

  // Ensure render call exists
  if (code.length > 100 && !code.includes('createRoot')) {
    code += '\nReactDOM.createRoot(document.getElementById("root")).render(<App />);';
  }

  return code;
}

export function repairTruncatedCode(code: string): string {
  if (!code || code.trim().length < 50) return code;

  let repaired = code;

  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openParens = (repaired.match(/\(/g) || []).length;
  const closeParens = (repaired.match(/\)/g) || []).length;

  for (let i = 0; i < openParens - closeParens; i++) {
    repaired += ')';
  }
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '\n}';
  }

  const openTags = repaired.match(/<([A-Z][a-zA-Z0-9]*)[^/>]*(?<!\/)>/g) || [];
  const closeTags = repaired.match(/<\/([A-Z][a-zA-Z0-9]*)>/g) || [];
  const openTagNames = openTags.map(t => (t.match(/<([A-Z][a-zA-Z0-9]*)/) || [])[1]).filter(Boolean);
  const closeTagNames = closeTags.map(t => (t.match(/<\/([A-Z][a-zA-Z0-9]*)>/) || [])[1]).filter(Boolean);

  const tagStack: string[] = [];
  for (const tag of openTagNames) {
    tagStack.push(tag);
  }
  for (const tag of closeTagNames) {
    const idx = tagStack.lastIndexOf(tag);
    if (idx !== -1) tagStack.splice(idx, 1);
  }

  for (let i = tagStack.length - 1; i >= 0; i--) {
    repaired += `</${tagStack[i]}>`;
  }

  if (!repaired.includes('createRoot')) {
    repaired += '\nReactDOM.createRoot(document.getElementById("root")).render(<App />);';
  }

  return repaired;
}

export function validateGeneratedCode(code: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!code || code.length < 200) {
    issues.push('Code is too short (< 200 chars)');
  }
  if (!code.includes('useState')) {
    issues.push('Missing useState — app likely has no interactivity');
  }
  if (!code.includes('function App') && !code.includes('const App')) {
    issues.push('Missing App component definition');
  }
  if (!code.includes('createRoot') && !code.includes('ReactDOM.render')) {
    issues.push('Missing render call');
  }
  if (/^import\s+/m.test(code)) {
    issues.push('Contains import statements (will break in-browser Babel)');
  }
  if (/if\s*\([^)]*\)\s*\{[^}]*use(State|Effect|Callback|Memo|Ref)\s*\(/m.test(code)) {
    issues.push('Hooks called inside if blocks (will crash with error #311)');
  }
  if (/\?\s*use(State|Effect|Callback|Memo|Ref)\s*\(/m.test(code)) {
    issues.push('Hooks called inside ternary (will crash with error #311)');
  }
  if (/^(?:export\s+)?interface\s+\w+\s*\{/m.test(code)) {
    issues.push('Contains TypeScript interface declarations (will break Babel)');
  }
  if (/^(?:export\s+)?type\s+\w+\s*=/m.test(code)) {
    issues.push('Contains TypeScript type aliases (will break Babel)');
  }
  if (!code.includes('= React') && !code.includes('React.useState')) {
    issues.push('Missing React destructuring (const {useState, ...} = React)');
  }

  return { valid: issues.length === 0, issues };
}

/* ------------------------------------------------------------------ */
/*  Virtual build operations (progress UI)                              */
/* ------------------------------------------------------------------ */

function emitVirtualBuildOperations(intent: ReasonedIntent, onProgress?: ProgressCallback) {
  if (!onProgress) return;

  const pages = (intent.nav_tabs ?? []).map(t => t.label).filter(Boolean);
  for (const page of pages.slice(0, 6)) {
    onProgress({ type: 'writing', message: `Wrote ${page} Page`, data: { path: page, operation: 'write', kind: 'page', virtual: true } });
  }

  const features = (intent.feature_details ?? []).map(f => f.name).filter(Boolean);
  for (const feature of features.slice(0, 6)) {
    onProgress({ type: 'writing', message: `Wrote features/${feature}`, data: { path: `features/${feature}`, operation: 'write', kind: 'feature', virtual: true } });
  }
}

/* ------------------------------------------------------------------ */
/*  Diagnostic logging                                                  */
/* ------------------------------------------------------------------ */

const __diag_dir = dirname(fileURLToPath(import.meta.url));
const DIAG_LOG = __diag_dir + "/../../codegen-debug.log";
const DIAG_FILE_ENABLED = !!process.env.STARTBOX_DIAG_LOG;
function diagLog(msg: string) {
  if (DIAG_FILE_ENABLED) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try { appendFileSync(DIAG_LOG, line); } catch (e) { console.warn("[diagLog] write failed:", String(e)); }
  }
  console.log(msg);
}

/* ------------------------------------------------------------------ */
/*  Code generation via Anthropic SDK                                   */
/* ------------------------------------------------------------------ */

async function runTextCodeGeneration(
  client: Anthropic,
  modelId: string,
  systemPrompt: string,
  userMessage: string,
  onProgress?: ProgressCallback,
): Promise<CodeGenerationResult | null> {
  const timeoutMs = Number(process.env.STARTBOX_CODEGEN_TIMEOUT_MS ?? 480000);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  const heartbeatMessages = [
    "Planning component structure...",
    "Drafting UI sections...",
    "Wiring interactivity...",
    "Applying domain language...",
    "Finalizing code output...",
  ];
  let heartbeatIndex = 0;
  const heartbeat = setInterval(() => {
    if (!onProgress) return;
    const msg = heartbeatMessages[Math.min(heartbeatIndex, heartbeatMessages.length - 1)];
    onProgress({ type: "status", message: msg });
    heartbeatIndex += 1;
  }, 20000);

  try {
    const maxTokens = Number(process.env.STARTBOX_CODEGEN_MAX_TOKENS ?? 24000);
    diagLog(`[codegen] starting — model: ${modelId}, max_tokens: ${maxTokens}, timeout: ${timeoutMs / 1000}s`);
    diagLog(`[codegen] system prompt: ${systemPrompt.length} chars`);
    diagLog(`[codegen] user message: ${userMessage.length} chars`);
    onProgress?.({ type: 'writing', message: 'Generating code...', data: { milestone: true } });

    const stream = client.messages.stream({
      model: modelId,
      max_tokens: maxTokens,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage + "\n\nIMPORTANT: Output ONLY the complete React JSX code. No markdown fences, no explanation, no JSON wrapping. Just the raw code starting with `const {useState, ...} = React;`" }],
    });

    const abortHandler = () => stream.abort();
    controller.signal.addEventListener("abort", abortHandler, { once: true });

    const response = await stream.finalMessage();
    controller.signal.removeEventListener("abort", abortHandler);
    clearTimeout(timeoutHandle);

    const usage = response.usage as unknown as Record<string, number>;
    recordSpend(calculateCost(modelId, {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
    }));

    const stopReason = (response as unknown as Record<string, unknown>).stop_reason ?? "unknown";
    diagLog(`[codegen] API response — stop_reason: ${String(stopReason)}, input_tokens: ${usage.input_tokens}, output_tokens: ${usage.output_tokens}`);

    const textContent = extractTextFromResponse(
      response.content as Array<{ type: string; text?: string; thinking?: string }>,
    );

    diagLog(`[codegen] extracted text after thinking strip: ${textContent.length} chars`);

    if (!textContent) {
      diagLog("[codegen] FAIL: empty response after stripping thinking content");
      clearInterval(heartbeat);
      return null;
    }

    // Try to extract as JSON first (model may wrap in JSON)
    let rawCode = textContent;
    try {
      const jsonStr = extractJSON(textContent);
      const parsed = JSON.parse(jsonStr);
      if (parsed.generated_code) {
        const cleaned = cleanGeneratedCode(parsed.generated_code);
        if (cleaned && cleaned.length > 200) {
          clearInterval(heartbeat);
          return {
            generated_code: cleaned,
            app_name: parsed.app_name ?? "App",
            tagline: parsed.tagline ?? "",
            primary_color: parsed.primary_color ?? "#6366f1",
            icon: parsed.icon ?? "Zap",
            pages: parsed.pages ?? [],
            quality_score: 0,
            quality_breakdown: {} as QualityBreakdown,
            pipeline_artifact: {} as PipelineRunArtifact,
          };
        }
      }
    } catch {
      diagLog("[codegen] not JSON, treating as raw code");
    }

    // Clean as raw code
    rawCode = cleanGeneratedCode(rawCode);

    // Fence extraction fallback
    if (!rawCode || rawCode.length < 200) {
      const fencedFallback = extractCodeFromFences(textContent);
      if (fencedFallback && fencedFallback.length > (rawCode?.length ?? 0)) {
        rawCode = cleanGeneratedCode(fencedFallback);
      }
    }

    if (!rawCode || rawCode.length < 200) {
      rawCode = repairTruncatedCode(rawCode);
    }
    if (!rawCode || rawCode.length < 100) {
      diagLog(`[codegen] FAIL: code too short after all cleaning: ${rawCode?.length ?? 0} chars`);
      clearInterval(heartbeat);
      return null;
    }

    diagLog(`[codegen] SUCCESS: returning ${rawCode.length} chars of code`);
    clearInterval(heartbeat);
    return {
      generated_code: rawCode,
      app_name: "App",
      tagline: "",
      primary_color: "#6366f1",
      icon: "Zap",
      pages: [],
      quality_score: 0,
      quality_breakdown: {} as QualityBreakdown,
      pipeline_artifact: {} as PipelineRunArtifact,
    };
  } catch (e) {
    clearTimeout(timeoutHandle);
    diagLog(`[codegen] EXCEPTION: ${e instanceof Error ? e.message : String(e)}`);
    if (controller.signal.aborted) {
      throw new Error(`Code generation timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearInterval(heartbeat);
  }
}

/* ------------------------------------------------------------------ */
/*  LLM repair pass                                                     */
/* ------------------------------------------------------------------ */

export async function repairGeneratedCode(
  client: Anthropic,
  modelId: string,
  originalCode: string,
  repairInstructions: string,
  onProgress?: ProgressCallback,
): Promise<string | null> {
  const REPAIR_SYSTEM = buildRepairSystemPrompt();

  const userMessage = [
    `FIX THESE ISSUES:`,
    repairInstructions,
    ``,
    `CURRENT CODE:`,
    originalCode,
    ``,
    `Return the COMPLETE fixed code with all existing features preserved. Fix ONLY the issues listed above.`,
  ].join('\n');

  const timeoutMs = Number(process.env.STARTBOX_REPAIR_TIMEOUT_MS ?? 60000);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    onProgress?.({ type: 'status', message: 'Optimizing visual quality...' });
    llmLog("repair", { model: modelId });
    const response = await client.messages.create({
      model: modelId,
      max_tokens: 24000,
      temperature: 0.5,
      system: REPAIR_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    }, { signal: controller.signal });
    clearTimeout(timeoutHandle);

    const usage = response.usage as unknown as Record<string, number>;
    const cost = calculateCost(modelId, { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens });
    recordSpend(cost);
    console.log(`Repair pass tokens — input: ${usage.input_tokens}, output: ${usage.output_tokens} (est cost: $${cost.toFixed(3)})`);

    const text = extractTextFromResponse(
      response.content as Array<{ type: string; text?: string; thinking?: string }>,
    );

    const cleaned = cleanGeneratedCode(text);
    if (!cleaned || cleaned.length < 200) return null;

    const validation = validateGeneratedCode(cleaned);
    if (!validation.valid) {
      console.warn(`Repair output validation issues: ${validation.issues.join(', ')}`);
      return null;
    }

    return cleaned;
  } catch (e) {
    clearTimeout(timeoutHandle);
    console.warn("Repair pass failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main entry: generateReactCode                                       */
/* ------------------------------------------------------------------ */

export async function generateReactCode(
  intent: ReasonedIntent,
  originalPrompt: string,
  onProgress?: ProgressCallback,
): Promise<CodeGenerationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({
    apiKey,
    maxRetries: 3,
    ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
  });
  const modelId = resolveModel("standard");

  const themeStyle = intent.theme_style ?? 'light';
  const systemPrompt = buildCodegenSystemPrompt(themeStyle);

  /* ---------------------------------------------------------------- */
  /*  Build lean user message (VoxMatch-style)                         */
  /* ---------------------------------------------------------------- */

  const tabList = intent.nav_tabs.map(t =>
    `  ${t.id}: "${t.label}" (icon: ${t.icon}, layout: ${t.layout}) — ${t.purpose}`
  ).join("\n");

  const featureDetails = (intent.feature_details ?? []).map(f =>
    `  - ${f.name}: ${f.description}`
  ).join("\n");

  const firstTab = intent.nav_tabs[0];
  const firstTabId = firstTab?.id ?? 'main';

  const baseUserMessage = [
    `Build: "${originalPrompt}"`,
    ...(intent.reference_app ? [
      `REFERENCE PRODUCT: "${intent.reference_app}" — Use YOUR knowledge of this product. Build the SAME type of app (same domain, same core features, same UX patterns) with an original name.`,
    ] : []),
    ``,
    `WHAT THE USER WANTS: ${intent.primary_goal}`,
    `The user expects to see a REAL, WORKING ${intent.domain} app — not a generic dashboard with placeholder buttons.`,
    ``,
    `APP INFO: ${intent.app_name_hint} | Color: ${intent.primary_color} | Theme: ${themeStyle}`,
    ``,
    `PAGES:`,
    tabList,
    `Default page: "${firstTabId}"`,
    ``,
    `KEY FEATURES:`,
    featureDetails || `  - ${intent.premium_features?.join("\n  - ") ?? "standard"}`,
    ``,
    `IMPORTANT — The CORE EXPERIENCE must be front-and-center on page load:`,
    `- If this is a visual app (game, solver, visualizer), the visual element MUST be visible immediately`,
    `- If this is a data app (tracker, CRM, planner), show populated data with working CRUD`,
    `- If this is a tool (calculator, converter, analyzer), show the tool interface ready to use`,
    `- NEVER show a landing page, hero section, or "Get Started" screen`,
    ``,
    `EVERY interactive element must work. Every button must have an onClick that changes state.`,
    `Use window.__sb.useStore() for persistent data. Use window.__sb.toast() for feedback.`,
    `Make it look like a real ${intent.domain} product with ${intent.primary_color} as primary color.`,
    ``,
    `OUTPUT: ONLY the complete JSX code. No markdown. No explanation.`,
  ].join("\n");

  try {
    emitVirtualBuildOperations(intent, onProgress);
    onProgress?.({ type: 'status', message: 'Synthesizing source code...' });
    diagLog(`[generateReactCode] starting`);

    let candidate: CodeGenerationResult | null = null;

    llmLog("codegen", { model: modelId });
    candidate = await runTextCodeGeneration(client, modelId, systemPrompt, baseUserMessage, onProgress);

    if (!candidate) {
      diagLog("[generateReactCode] code generation returned null — no usable output");
      onProgress?.({ type: 'status', message: 'Build failed — retrying is recommended' });
      return null;
    }

    if (candidate.app_name === "App" && intent.app_name_hint) {
      candidate.app_name = intent.app_name_hint;
    }

    onProgress?.({ type: 'status', message: 'Running quality checks...' });

    const evaluation = scoreGeneratedCode({
      code: candidate.generated_code,
      prompt: originalPrompt,
      outputFormat: intent.output_format_hint,
      requestedLayout: intent.layout_blueprint,
      requestedMood: themeStyle,
      domainKeywords: intent.domain_keywords,
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
      candidates: [{
        id: "A",
        quality_score: evaluation.quality_score,
        quality_breakdown: evaluation.quality_breakdown,
      }],
      repaired: false,
    };

    const result: CodeGenerationResult = {
      ...candidate,
      quality_score: evaluation.quality_score,
      quality_breakdown: evaluation.quality_breakdown,
      pipeline_artifact: pipelineArtifact,
    };
    console.log(`Code generation success: ${result.app_name}, ${result.generated_code.length} chars, score ${result.quality_score}`);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Code generation failed:", msg);
    onProgress?.({ type: 'status', message: `Build error: ${msg.slice(0, 100)}` });
    return null;
  }
}
