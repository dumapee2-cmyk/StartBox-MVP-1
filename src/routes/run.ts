import { Router } from "express";
import { ZodError } from "zod";
import { prisma } from "../lib/db.js";
import { executeApp } from "../lib/executor.js";
import { runAppRequestSchema } from "../lib/schema.js";
import { runRateLimiter } from "../lib/safety.js";
import type { AppSpec } from "../types/index.js";

export const runRouter = Router();

runRouter.post("/:id/run", runRateLimiter, async (req, res) => {
  try {
    const body = runAppRequestSchema.parse(req.body);

    const appId = String(req.params.id);
    const app = await prisma.app.findUnique({ where: { id: appId } });
    if (!app) return res.status(404).json({ message: "App not found" });

    const spec = app.spec as unknown as AppSpec;
    const result = await executeApp(app.id, spec, body.inputs, body.nav_id);
    return res.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: "Invalid request", issues: error.issues });
    }
    const appError = error as { status?: number; message?: string };
    if (appError.status) {
      return res.status(appError.status).json({ message: appError.message });
    }
    console.error("Execution error:", error);
    return res.status(500).json({ message: "Execution failed" });
  }
});
