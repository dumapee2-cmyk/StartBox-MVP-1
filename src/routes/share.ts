import { Router } from "express";
import { prisma } from "../lib/db.js";

export const shareRouter = Router();

shareRouter.get("/:shortId", async (req, res) => {
  const app = await prisma.app.findUnique({ where: { short_id: req.params.shortId } });
  if (!app) return res.status(404).json({ message: "App not found" });
  return res.json(app);
});
