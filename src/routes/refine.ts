import { Router } from "express";
import rateLimit from "express-rate-limit";
import Anthropic from "@anthropic-ai/sdk";
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
});

const REFINE_SYSTEM_PROMPT = `You are an expert React developer. Your job is to modify existing React application code based on a specific instruction.

RULES:
1. Return ONLY the modified code — no explanation, no markdown code blocks, just raw JSX
2. Preserve all existing functionality — only change what was asked
3. Keep the same structure: no import statements, window.LucideReact for icons, window.__sbAI for AI calls
4. The last line must remain: ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
5. Make minimal targeted changes — don't rewrite the whole app
6. If asked to change color: update the primary color hex value throughout the code
7. If asked to add a feature: add it cleanly without breaking existing features
8. If asked to change text/copy: update only the relevant strings`;

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

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: REFINE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            `Instruction: ${body.instruction}`,
            ``,
            `Current app code:`,
            ``,
            app.generated_code,
          ].join("\n"),
        },
      ],
    });

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

    return res.json({ updated_code });
  } catch (e) {
    console.error("Refine AI error:", e);
    return res.status(502).json({ message: "Refinement failed. Please try again." });
  }
});
