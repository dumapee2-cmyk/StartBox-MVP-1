import { Router } from "express";
import { ZodError, z } from "zod";
import { generateFromPrompt } from "../lib/generator.js";
import { generateRateLimiter, checkContentSafety } from "../lib/safety.js";
import { canSpend, getDailySpend, getDailyCap } from "../lib/costTracker.js";
import type { ProgressCallback } from "../lib/progressEmitter.js";

export const generateRouter = Router();

const generateBodySchema = z.object({
  prompt: z.string().min(10).max(4000),
  model: z.enum(["auto", "sonnet", "opus"]).optional().default("auto"),
});

generateRouter.post("/", generateRateLimiter, async (req, res) => {
  try {
    const body = generateBodySchema.parse(req.body);

    const safety = checkContentSafety(body.prompt);
    if (!safety.safe) {
      return res.status(400).json({ message: safety.reason });
    }

    if (!canSpend()) {
      return res.status(429).json({
        message: `Daily API spend cap reached ($${getDailySpend().toFixed(2)} / $${getDailyCap()} limit). Try again tomorrow or raise STARTBOX_DAILY_SPEND_CAP_USD.`,
      });
    }

    const wantsSSE = req.headers.accept?.includes("text/event-stream");

    if (wantsSSE) {
      // ── SSE streaming mode ──
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const heartbeat = setInterval(() => {
        res.write(": heartbeat\n\n");
      }, 15000);

      let disconnected = false;
      req.on("close", () => {
        disconnected = true;
        clearInterval(heartbeat);
      });

      const onProgress: ProgressCallback = (event) => {
        if (!disconnected) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      };

      try {
        const result = await generateFromPrompt(body.prompt, body.model, onProgress);
        if (!disconnected) {
          res.write(`data: ${JSON.stringify({ type: "done", message: "Complete", data: result })}\n\n`);
        }
      } catch (error) {
        if (!disconnected) {
          const msg = error instanceof Error ? error.message : "Generation failed";
          res.write(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`);
        }
      } finally {
        clearInterval(heartbeat);
        res.end();
      }
    } else {
      // ── Standard JSON mode (backwards compatible) ──
      const routeTimeoutMs = Number(process.env.STARTBOX_ROUTE_TIMEOUT_MS ?? 300000);
      const result = await Promise.race([
        generateFromPrompt(body.prompt, body.model),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Generation timed out after ${routeTimeoutMs}ms`)), routeTimeoutMs),
        ),
      ]);
      return res.status(201).json(result);
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: "Invalid request", issues: error.issues });
    }
    if (error instanceof Error && error.message.includes("timed out")) {
      return res.status(504).json({ message: error.message });
    }
    console.error("Generation error:", error);
    return res.status(500).json({ message: "Generation failed" });
  }
});
