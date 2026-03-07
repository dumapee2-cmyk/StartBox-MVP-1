import { describe, expect, it } from "vitest";
import type { GenerateResult } from "../types/index.js";
import { buildGenerateResponseMetadata, buildSseDoneEvent } from "./generate.js";

const baseResult: GenerateResult = {
  id: "app-1",
  short_id: "abc123",
  name: "Demo",
  tagline: "Demo tagline",
  description: "Demo app",
  spec: {
    schema_version: "2",
    name: "Demo",
    tagline: "Demo tagline",
    description: "Demo app",
    theme: { primary: "#6366f1", style: "light", icon: "Zap" },
    navigation: [{ id: "home", label: "Home", icon: "Home" }],
    screens: [],
  },
  generated_code: "const App = () => <div/>;\nReactDOM.createRoot(document.getElementById('root')).render(<App />);",
  shareUrl: "/share/abc123",
};

describe("generate route helpers", () => {
  it("returns kimi metadata while preserving requested model value", () => {
    const metadata = buildGenerateResponseMetadata("sonnet");
    expect(metadata.model_requested).toBe("sonnet");
    expect(metadata.provider_resolved).toBe("kimi");
    expect(metadata.model_resolved.length).toBeGreaterThan(0);
  });

  it("builds SSE done event only when generated_code is non-empty", () => {
    const done = buildSseDoneEvent(baseResult, "opus");
    expect(done).not.toBeNull();
    expect(done?.type).toBe("done");
    expect(done?.data.model_requested).toBe("opus");

    const missingCode = buildSseDoneEvent({ ...baseResult, generated_code: "   " }, "kimi");
    expect(missingCode).toBeNull();
  });
});
