import { prisma } from "./db.js";
import { randomUUID } from "node:crypto";
import { translateEnglishPromptWithReasoning, type ReasonedIntent } from "./reasoner.js";
import { generateReactCode } from "./codeGenerator.js";
import type { GenerateResult, AppSpec } from "../types/index.js";
import type { ProgressCallback } from "./progressEmitter.js";
import { createPipelineContext, runStateMachine } from "./pipeline/index.js";
import type { PipelineContext } from "./pipeline/types.js";

/* ------------------------------------------------------------------ */
/*  Pipeline state machine path (opt-in via STARTBOX_USE_PIPELINE=1)   */
/* ------------------------------------------------------------------ */

function resolvePipelineFailureMessage(ctx: PipelineContext): string {
  const messages = ctx.errors
    .map((e) => e.message?.trim())
    .filter((m): m is string => Boolean(m && m.length > 0));

  const explicitNoCode = messages.find((m) => m.includes("NO_CODE_PRODUCED"));
  if (explicitNoCode) return explicitNoCode;

  const timeout = messages.find((m) => /timed out/i.test(m));
  if (timeout) return timeout;

  // Return first specific error message if any exist
  if (messages.length > 0) return messages[0];

  const hasUsableCode = Boolean(ctx.result?.generated_code?.trim());
  if (!hasUsableCode) {
    return "NO_CODE_PRODUCED: generation completed without usable code";
  }

  return `Generation failed in ${ctx.state}`;
}

async function generateWithStateMachine(
  prompt: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  const ctx = createPipelineContext(prompt, "kimi", onProgress, signal);
  const finalCtx = await runStateMachine(ctx);

  if (finalCtx.state === "COMPLETE" && finalCtx.result?.generated_code?.trim()) {
    return finalCtx.result;
  }

  throw new Error(resolvePipelineFailureMessage(finalCtx));
}

/* ------------------------------------------------------------------ */
/*  VoxMatch-style direct path (default)                               */
/* ------------------------------------------------------------------ */

function sanitizeNavId(id: string): string {
  return id.toLowerCase().replace(/[^a-z_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'tab';
}

function buildDeterministicAppSpec(intent: ReasonedIntent): AppSpec {
  const screens = intent.nav_tabs.map((tab, i) => ({
    nav_id: sanitizeNavId(tab.id),
    layout: tab.layout,
    hero: {
      title: i === 0 ? intent.primary_goal.slice(0, 60) : tab.purpose.slice(0, 60),
      subtitle: i === 0 ? `Powered by AI for ${intent.domain}` : tab.purpose.slice(0, 120),
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
      system_prompt: `You are an expert ${intent.domain} AI assistant. ${intent.primary_goal}.`,
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
    navigation: intent.nav_tabs.map((t) => ({ id: sanitizeNavId(t.id), label: t.label, icon: t.icon })),
    screens,
  };
}

async function generateDirect(
  prompt: string,
  onProgress?: ProgressCallback,
): Promise<GenerateResult> {
  onProgress?.({ type: "status", message: "Scaffolding project..." });

  // Step 1: Run reasoner to extract structured intent
  console.log("Starting reasoner pipeline...");
  const intent = await translateEnglishPromptWithReasoning(prompt);

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
    layout_blueprint: "grid-dashboard",
    animation_keywords: ["smooth", "subtle"],
    visual_requirements: {
      hero_pattern: "gradient_banner",
      card_style: "mixed",
      data_density: "moderate",
      color_usage: "full_color",
    },
    item_display_format: "grid_cards",
    typography_style: "bold_headlines",
    narrative: `A custom-built tool based on your idea: "${prompt.slice(0, 100)}".`,
    feature_details: [
      { name: "AI analysis", description: "Intelligent analysis powered by AI" },
      { name: "Instant results", description: "Get results in seconds" },
    ],
    reasoning_summary: "Fallback: no LLM available",
  };

  // Emit narrative + plan events for frontend
  if (resolvedIntent.narrative) {
    onProgress?.({
      type: "narrative",
      message: resolvedIntent.narrative,
      data: { app_name: resolvedIntent.app_name_hint },
    });
  }
  onProgress?.({
    type: "plan",
    message: `Building ${resolvedIntent.app_name_hint}`,
    data: {
      app_name: resolvedIntent.app_name_hint,
      domain: resolvedIntent.domain,
      design: resolvedIntent.design_philosophy,
      tabs: resolvedIntent.nav_tabs.map((t) => t.label),
      features: resolvedIntent.premium_features ?? [],
      feature_details: resolvedIntent.feature_details ?? [],
    },
  });

  const spec = buildDeterministicAppSpec(resolvedIntent);

  onProgress?.({ type: "status", message: "Compiling components..." });

  // Step 2: Generate code with 2-attempt retry
  let generated_code: string | null = null;
  let theme_color: string | null = null;
  let tagline_override: string | null = null;
  let quality_score: number | undefined;
  let quality_breakdown: GenerateResult["quality_breakdown"] | undefined;
  let pipeline_run_id: string | undefined;
  let latest_pipeline_summary: string | undefined;
  let pipelineArtifact: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (attempt === 2) {
        console.log("Retrying code generation (attempt 2/2)...");
        onProgress?.({ type: "status", message: "Retrying code generation..." });
      }
      const codeResult = await generateReactCode(resolvedIntent, prompt, onProgress);
      if (codeResult) {
        generated_code = codeResult.generated_code;
        theme_color = codeResult.primary_color;
        tagline_override = codeResult.tagline;
        quality_score = codeResult.quality_score;
        quality_breakdown = codeResult.quality_breakdown;
        pipeline_run_id = codeResult.pipeline_artifact.run_id;
        latest_pipeline_summary = `Selected ${codeResult.pipeline_artifact.selected_candidate} (${codeResult.quality_score}/100)`;
        pipelineArtifact = codeResult.pipeline_artifact;
        break;
      } else {
        console.warn(`Code generation returned null (attempt ${attempt}/2)`);
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`React code generation error (attempt ${attempt}/2):`, errMsg);
      if (attempt === 2) {
        onProgress?.({ type: "status", message: `Code generation error: ${errMsg.slice(0, 80)}` });
      }
    }
  }

  if (!generated_code) {
    throw new Error("NO_CODE_PRODUCED: generation completed without usable code after 2 attempts");
  }

  // Step 3: Store in DB
  onProgress?.({ type: "status", message: "Deploying to preview..." });

  let app;
  for (let dbAttempt = 1; dbAttempt <= 3; dbAttempt++) {
    try {
      if (dbAttempt > 1) {
        console.log(`[generator] Retry DB write attempt ${dbAttempt}/3...`);
        await prisma.$disconnect();
        await prisma.$connect();
      }
      app = await prisma.app.create({
        data: {
          name: spec.name,
          description: spec.description,
          spec: spec as object,
          original_prompt: prompt,
          generated_code,
          ...(theme_color ? { theme_color } : {}),
          ...(tagline_override ? { tagline: tagline_override } : { tagline: spec.tagline }),
        },
      });
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (dbAttempt < 3 && (msg.includes("connection pool") || msg.includes("Timed out"))) {
        console.warn(`[generator] DB write failed (attempt ${dbAttempt}): ${msg}`);
        continue;
      }
      throw e;
    }
  }
  if (!app) throw new Error("[generator] All DB write attempts failed");

  // Best-effort version persistence
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO app_versions (id, app_id, label, source, generated_code, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
      randomUUID(),
      app.id,
      "Initial Generation",
      "generate",
      generated_code,
      JSON.stringify({ quality_score: quality_score ?? null, quality_breakdown: quality_breakdown ?? null }),
    );
  } catch (e) {
    console.warn("app_versions insert skipped:", e);
  }

  // Best-effort pipeline run persistence
  if (pipelineArtifact && pipeline_run_id) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO pipeline_runs (id, app_id, prompt, intent, artifact, quality_score, quality_breakdown, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::jsonb, NOW())`,
        pipeline_run_id,
        app.id,
        prompt,
        JSON.stringify(resolvedIntent),
        JSON.stringify(pipelineArtifact),
        quality_score ?? 0,
        JSON.stringify(quality_breakdown ?? {}),
      );
    } catch (e) {
      console.warn("pipeline_runs insert skipped:", e);
    }
  }

  // Update quality fields
  if (quality_score !== undefined || latest_pipeline_summary) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE apps
         SET latest_quality_score = COALESCE($2, latest_quality_score),
             latest_pipeline_summary = COALESCE($3, latest_pipeline_summary),
             updated_at = NOW()
         WHERE id = $1`,
        app.id,
        quality_score ?? null,
        latest_pipeline_summary ?? null,
      );
    } catch (e) {
      console.warn("apps quality fields update skipped:", e);
    }
  }

  return {
    id: app.id,
    short_id: app.short_id,
    name: app.name,
    tagline: app.tagline ?? spec.tagline,
    description: app.description,
    spec,
    generated_code: app.generated_code ?? undefined,
    pipeline_run_id,
    quality_score,
    quality_breakdown,
    latest_pipeline_summary,
    shareUrl: `/share/${app.short_id}`,
  };
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                    */
/* ------------------------------------------------------------------ */

export async function generateFromPrompt(
  prompt: string,
  _model: "kimi" = "kimi",
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  if (process.env.STARTBOX_USE_PIPELINE === "1") {
    return generateWithStateMachine(prompt, onProgress, signal);
  }
  return generateDirect(prompt, onProgress);
}
