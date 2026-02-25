import { Router } from "express";
import { prisma } from "../lib/db.js";
import type { AppSpec } from "../types/index.js";

export const appsRouter = Router();

appsRouter.get("/", async (_req, res) => {
  const apps = await prisma.app.findMany({
    orderBy: { created_at: "desc" },
    take: 24,
    select: {
      id: true,
      short_id: true,
      name: true,
      description: true,
      tagline: true,
      theme_color: true,
      run_count: true,
      created_at: true,
    },
  });
  return res.json(apps);
});

appsRouter.get("/:id", async (req, res) => {
  const app = await prisma.app.findUnique({ where: { id: req.params.id } });
  if (!app) return res.status(404).json({ message: "App not found" });
  return res.json(app);
});

appsRouter.post("/:id/fork", async (req, res) => {
  const original = await prisma.app.findUnique({ where: { id: req.params.id } });
  if (!original) return res.status(404).json({ message: "App not found" });

  const spec = original.spec as unknown as AppSpec;
  const forked = await prisma.app.create({
    data: {
      name: `Copy of ${original.name}`.slice(0, 100),
      description: original.description,
      spec: original.spec as object,
      original_prompt: original.original_prompt,
      forked_from: original.id,
      generated_code: original.generated_code ?? undefined,
      theme_color: original.theme_color ?? undefined,
      tagline: original.tagline ?? undefined,
    },
  });

  return res.status(201).json({
    id: forked.id,
    short_id: forked.short_id,
    name: forked.name,
    tagline: forked.tagline ?? spec.tagline,
    description: forked.description,
    spec,
    generated_code: forked.generated_code ?? undefined,
    shareUrl: `/share/${forked.short_id}`,
  });
});
