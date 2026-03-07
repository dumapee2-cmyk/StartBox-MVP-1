import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("server route mounts", () => {
  it("mounts /api/agent router", () => {
    const serverSource = readFileSync(resolve(process.cwd(), "src/server.ts"), "utf8");
    expect(serverSource).toContain('app.use("/api/agent", agentRouter);');
  });
});
