import { prisma } from "./db.js";
import { runGenerationPipeline } from "./pipeline.js";
import { generateReactCode } from "./codeGenerator.js";
import type { GenerateResult } from "../types/index.js";

export async function generateFromPrompt(
  prompt: string,
  model: "sonnet" | "opus" = "sonnet",
): Promise<GenerateResult> {
  // Step 1: Run AppSpec pipeline (reasoner + spec builder) — also returns intent
  const { spec, intent } = await runGenerationPipeline(prompt);

  // Step 2: Generate real React code using the intent already extracted above (no extra API call)
  let generated_code: string | null = null;
  let theme_color: string | null = null;
  let tagline_override: string | null = null;

  try {
    const codeResult = await generateReactCode(intent, prompt, model);
    if (codeResult) {
      generated_code = codeResult.generated_code;
      theme_color = codeResult.primary_color;
      tagline_override = codeResult.tagline;
    }
  } catch (e) {
    console.error("React code generation error (non-fatal):", e);
  }

  // Step 3: Store in DB
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

  return {
    id: app.id,
    short_id: app.short_id,
    name: app.name,
    tagline: app.tagline ?? spec.tagline,
    description: app.description,
    spec,
    generated_code: app.generated_code ?? undefined,
    shareUrl: `/share/${app.short_id}`,
  };
}
