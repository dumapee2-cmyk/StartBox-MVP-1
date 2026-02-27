import { prisma } from "./db.js";
import { runGenerationPipeline } from "./pipeline.js";
import { generateReactCode } from "./codeGenerator.js";
import { gatherAppContext } from "./contextResearch.js";
import type { GenerateResult } from "../types/index.js";
import type { ProgressCallback } from "./progressEmitter.js";
import { randomUUID } from "node:crypto";

export async function generateFromPrompt(
  prompt: string,
  model: "auto" | "sonnet" | "opus" = "auto",
  onProgress?: ProgressCallback,
): Promise<GenerateResult> {
  // Always use Haiku (via "sonnet" path) for cost efficiency (~$0.07/gen)
  // Opus is only used if explicitly requested — never auto-selected
  const resolvedModel = model === "opus" ? "opus" : "sonnet";

  onProgress?.({ type: "status", message: "Analyzing your idea..." });

  // Step 0+1: Run context research and reasoner in PARALLEL
  // The reasoner works fine without context; context is passed to code gen where it matters most
  console.log("Starting parallel: context research + reasoner...");
  const [contextResult, pipelineResult] = await Promise.allSettled([
    gatherAppContext(prompt),
    runGenerationPipeline(prompt),
  ]);

  let contextBrief = null;
  if (contextResult.status === "fulfilled" && contextResult.value) {
    contextBrief = contextResult.value;
    console.log(`Context research: found ${contextBrief.competitive_landscape.length} competitors, ${contextBrief.must_have_features.length} must-have features`);
    onProgress?.({ type: "status", message: "Researching similar apps..." });
  } else {
    console.log("Context research: no results (non-fatal)", contextResult.status === "rejected" ? contextResult.reason : "");
  }

  if (pipelineResult.status === "rejected") {
    throw pipelineResult.reason;
  }
  const { spec, intent } = pipelineResult.value;

  // Emit plan event with structured data from the reasoner
  onProgress?.({
    type: "plan",
    message: `Building ${intent.app_name_hint}`,
    data: {
      app_name: intent.app_name_hint,
      domain: intent.domain,
      design: intent.design_philosophy,
      tabs: intent.nav_tabs.map((t: { label: string; icon: string }) => t.label),
      features: intent.premium_features ?? [],
    },
  });

  onProgress?.({ type: "status", message: "Generating code..." });

  // Step 2: Generate real React code using the intent + context
  // onProgress is threaded through so code gen emits real-time "writing" events
  // via stream.on('inputJson') as components are detected during Anthropic streaming
  let generated_code: string | null = null;
  let theme_color: string | null = null;
  let tagline_override: string | null = null;
  let quality_score: number | undefined;
  let quality_breakdown: GenerateResult["quality_breakdown"] | undefined;
  let pipeline_run_id: string | undefined;
  let latest_pipeline_summary: string | undefined;
  let pipelineArtifact: unknown = null;

  try {
    const codeResult = await generateReactCode(intent, prompt, resolvedModel, contextBrief, onProgress);
    if (codeResult) {
      generated_code = codeResult.generated_code;
      theme_color = codeResult.primary_color;
      tagline_override = codeResult.tagline;
      quality_score = codeResult.quality_score;
      quality_breakdown = codeResult.quality_breakdown;
      pipeline_run_id = codeResult.pipeline_artifact.run_id;
      latest_pipeline_summary = `Selected ${codeResult.pipeline_artifact.selected_candidate} (${codeResult.quality_score}/100)`;
      pipelineArtifact = codeResult.pipeline_artifact;

      onProgress?.({
        type: "quality",
        message: `Quality score: ${codeResult.quality_score}/100`,
        data: {
          score: codeResult.quality_score,
          breakdown: codeResult.quality_breakdown,
        },
      });
    }
  } catch (e) {
    console.error("React code generation error (non-fatal):", e);
  }

  // Step 3: Store in DB
  onProgress?.({ type: "status", message: "Saving your app..." });
  const app = await prisma.app.create({
    data: {
      name: spec.name,
      description: spec.description,
      spec: spec as object,
      original_prompt: prompt,
      ...(generated_code ? { generated_code } : {}),
      ...(theme_color ? { theme_color } : {}),
      ...(tagline_override ? { tagline: tagline_override } : { tagline: spec.tagline }),
    },
  });

  // Best-effort pipeline/version persistence (safe if DB migration not applied yet)
  if (generated_code) {
    try {
      const versionId = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO app_versions (id, app_id, label, source, generated_code, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
        versionId,
        app.id,
        "Initial Generation",
        "generate",
        generated_code,
        JSON.stringify({
          quality_score: quality_score ?? null,
          quality_breakdown: quality_breakdown ?? null,
        }),
      );
    } catch (e) {
      console.warn("app_versions insert skipped:", e);
    }
  }

  if (pipelineArtifact && pipeline_run_id) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO pipeline_runs (id, app_id, prompt, intent, artifact, quality_score, quality_breakdown, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::jsonb, NOW())`,
        pipeline_run_id,
        app.id,
        prompt,
        JSON.stringify(intent),
        JSON.stringify(pipelineArtifact),
        quality_score ?? 0,
        JSON.stringify(quality_breakdown ?? {}),
      );
    } catch (e) {
      console.warn("pipeline_runs insert skipped:", e);
    }
  }

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
