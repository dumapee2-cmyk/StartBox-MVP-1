import { Router } from "express";
import { prisma } from "../lib/db.js";
import type { AppSpec } from "../types/index.js";
import { randomUUID } from "node:crypto";

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
  let quality = null as null | { latest_quality_score: number | null; latest_pipeline_summary: string | null };
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ latest_quality_score: number | null; latest_pipeline_summary: string | null }>>(
      `SELECT latest_quality_score, latest_pipeline_summary FROM apps WHERE id = $1`,
      req.params.id,
    );
    quality = rows[0] ?? null;
  } catch {
    // ignore if migration not applied yet
  }
  return res.json({
    ...app,
    latest_quality_score: quality?.latest_quality_score ?? null,
    latest_pipeline_summary: quality?.latest_pipeline_summary ?? null,
  });
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
    quality_score: null,
    quality_breakdown: null,
    latest_pipeline_summary: null,
    shareUrl: `/share/${forked.short_id}`,
  });
});

appsRouter.get("/:id/versions", async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; app_id: string; label: string; source: string; created_at: Date }>
    >(
      `SELECT id, app_id, label, source, created_at
       FROM app_versions
       WHERE app_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      req.params.id,
    );
    return res.json(rows.map((row) => ({ ...row, created_at: row.created_at.toISOString() })));
  } catch (e) {
    console.error("versions list failed:", e);
    return res.json([]);
  }
});

appsRouter.post("/:id/versions/:versionId/restore", async (req, res) => {
  const { id, versionId } = req.params;
  const app = await prisma.app.findUnique({ where: { id } });
  if (!app) return res.status(404).json({ message: "App not found" });

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ generated_code: string }>>(
      `SELECT generated_code FROM app_versions WHERE id = $1 AND app_id = $2 LIMIT 1`,
      versionId,
      id,
    );
    const version = rows[0];
    if (!version) return res.status(404).json({ message: "Version not found" });

    await prisma.app.update({
      where: { id },
      data: { generated_code: version.generated_code },
    });

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO app_versions (id, app_id, label, source, generated_code, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
        randomUUID(),
        id,
        "Restore snapshot",
        "restore",
        version.generated_code,
        JSON.stringify({ restored_from: versionId }),
      );
    } catch {
      // ignore if table unavailable
    }

    return res.json({ restored: true });
  } catch (e) {
    console.error("restore version failed:", e);
    return res.status(500).json({ message: "Version restore failed" });
  }
});

appsRouter.get("/:id/pipeline-runs/:runId", async (req, res) => {
  const { id, runId } = req.params;
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        app_id: string;
        prompt: string;
        intent: unknown;
        artifact: unknown;
        quality_score: number;
        quality_breakdown: unknown;
        created_at: Date;
      }>
    >(
      `SELECT id, app_id, prompt, intent, artifact, quality_score, quality_breakdown, created_at
       FROM pipeline_runs
       WHERE id = $1 AND app_id = $2
       LIMIT 1`,
      runId,
      id,
    );
    const item = rows[0];
    if (!item) return res.status(404).json({ message: "Pipeline run not found" });
    return res.json({ ...item, created_at: item.created_at.toISOString() });
  } catch (e) {
    console.error("pipeline run fetch failed:", e);
    return res.status(404).json({ message: "Pipeline run not found" });
  }
});
