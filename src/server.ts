import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./lib/db.js";
import { generateRouter } from "./routes/generate.js";
import { appsRouter } from "./routes/apps.js";
import { runRouter } from "./routes/run.js";
import { shareRouter } from "./routes/share.js";
import { chatRouter } from "./routes/chat.js";
import { refineRouter } from "./routes/refine.js";
import { clarifyRouter } from "./routes/clarify.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.set("trust proxy", 1);

// API routes
app.use("/api/generate", generateRouter);
app.use("/api/apps", appsRouter);
app.use("/api/apps", runRouter);
app.use("/api/apps", chatRouter);
app.use("/api/apps", refineRouter);
app.use("/api/clarify", clarifyRouter);
app.use("/api/share", shareRouter);

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ ok: true, service: "startbox-api", db: "connected" });
  } catch {
    return res.status(503).json({ ok: false, service: "startbox-api", db: "disconnected" });
  }
});

// Serve React frontend
app.use(express.static(publicDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, () => {
  console.log(`StartBox API running on http://localhost:${port}`);
});
