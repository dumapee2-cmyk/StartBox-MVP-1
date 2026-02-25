import { Router } from "express";
import { ZodError, z } from "zod";
import { generateFromPrompt } from "../lib/generator.js";
import { generateRateLimiter, checkContentSafety } from "../lib/safety.js";

export const generateRouter = Router();

const generateBodySchema = z.object({
  prompt: z.string().min(10).max(4000),
  model: z.enum(["sonnet", "opus"]).optional().default("sonnet"),
});

generateRouter.post("/", generateRateLimiter, async (req, res) => {
  try {
    const body = generateBodySchema.parse(req.body);

    const safety = checkContentSafety(body.prompt);
    if (!safety.safe) {
      return res.status(400).json({ message: safety.reason });
    }

    const result = await generateFromPrompt(body.prompt, body.model);
    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: "Invalid request", issues: error.issues });
    }
    console.error("Generation error:", error);
    return res.status(500).json({ message: "Generation failed" });
  }
});
