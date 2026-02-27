import { Router } from "express";
import rateLimit from "express-rate-limit";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db.js";
import { z } from "zod";

export const refineRouter = Router();

const refineRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: (req) => `refine:${String((req.params as Record<string, string>)["id"] ?? "")}`,
  validate: false,
  message: { message: "Too many refinement requests. Please wait." },
  standardHeaders: true,
  legacyHeaders: false,
});

const refineRequestSchema = z.object({
  instruction: z.string().min(3).max(2000),
  mode: z.enum(["build", "visual_edit", "discuss"]),
});

const BUILD_MODE_SYSTEM_PROMPT = `You are an expert React developer. Your job is to modify existing React application code based on a specific instruction.

RULES:
1. Return ONLY the modified code — no explanation, no markdown code blocks, just raw JSX
2. Preserve all existing functionality — only change what was asked
3. Keep the same structure: no import statements, window.LucideReact for icons, window.__sbAI for AI calls
4. The last line must remain: ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
5. Make minimal targeted changes — don't rewrite the whole app
6. If asked to change color: update the primary color hex value throughout the code
7. If asked to add a feature: add it cleanly without breaking existing features
8. If asked to change text/copy: update only the relevant strings`;

const VISUAL_EDIT_SYSTEM_PROMPT = `You are a senior UI engineer focused ONLY on visual edits.

RULES:
1. Return ONLY modified raw JSX code.
2. You may change styling, spacing, typography, color, animation, and layout.
3. You must NOT add/remove core product features or change business logic.
4. Keep all AI call logic and state behavior intact.
5. Preserve app purpose and functional flow.
6. No import statements.
7. Keep ReactDOM.createRoot(...) as the last line.`;

const DISCUSS_MODE_SYSTEM_PROMPT = `You are a product design assistant.

RULES:
1. Give advisory feedback only.
2. Do NOT output code.
3. Provide concise suggestions and a short prioritized action list.`;

refineRouter.post("/:id/refine", refineRateLimiter, async (req, res) => {
  const id = String(req.params["id"]);

  const app = await prisma.app.findUnique({ where: { id } });
  if (!app) return res.status(404).json({ message: "App not found" });
  if (!app.generated_code) {
    return res.status(400).json({ message: "This app has no generated code to refine" });
  }

  let body: z.infer<typeof refineRequestSchema>;
  try {
    body = refineRequestSchema.parse(req.body);
  } catch {
    return res.status(400).json({ message: "Invalid request body" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ message: "AI service unavailable" });

  const client = new Anthropic({ apiKey, maxRetries: 0 });

  const REFINE_TIMEOUT_MS = 90_000;
  const CODE_CONTEXT_LIMIT = 10_000;
  const codeContext = app.generated_code.length > CODE_CONTEXT_LIMIT
    ? app.generated_code.slice(0, CODE_CONTEXT_LIMIT) + "\n// ... [truncated]"
    : app.generated_code;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REFINE_TIMEOUT_MS);

  try {
    if (body.mode === "discuss") {
      const advisory = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        system: DISCUSS_MODE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              `Instruction: ${body.instruction}`,
              ``,
              `Current app code summary context (excerpt):`,
              codeContext.slice(0, 8000),
            ].join("\n"),
          },
        ],
      }, { signal: controller.signal });
      clearTimeout(timeoutHandle);
      const advisoryText = advisory.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("\n")
        .trim();
      return res.json({ advisory: advisoryText || "No advisory output", mode: body.mode });
    }

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      system: body.mode === "visual_edit" ? VISUAL_EDIT_SYSTEM_PROMPT : BUILD_MODE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `Instruction: ${body.instruction}`,
            ``,
            `Current app code:`,
            ``,
            codeContext,
          ].join("\n"),
        },
      ],
    }, { signal: controller.signal });
    clearTimeout(timeoutHandle);

    const updated_code = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n")
      .trim();

    if (!updated_code || updated_code.length < 100) {
      return res.status(502).json({ message: "Refinement produced invalid output" });
    }

    // Save updated code to DB
    await prisma.app.update({
      where: { id },
      data: { generated_code: updated_code },
    });

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO app_versions (id, app_id, label, source, generated_code, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
        randomUUID(),
        id,
        body.mode === "visual_edit" ? "Visual Edit" : "Build Edit",
        "refine",
        updated_code,
        JSON.stringify({ instruction: body.instruction, mode: body.mode }),
      );
    } catch {
      // ignore if versions table not available
    }

    return res.json({ updated_code, mode: body.mode });
  } catch (e) {
    clearTimeout(timeoutHandle);
    if (controller.signal.aborted) {
      return res.status(504).json({ message: "Refinement timed out" });
    }
    console.error("Refine AI error:", e);
    return res.status(502).json({ message: "Refinement failed. Please try again." });
  }
});
