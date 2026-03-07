import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateResult } from "../types/index.js";
import type { PipelineContext } from "./pipeline/types.js";

const { mockedCreatePipelineContext, mockedRunStateMachine } = vi.hoisted(() => ({
  mockedCreatePipelineContext: vi.fn(),
  mockedRunStateMachine: vi.fn(),
}));

vi.mock("./pipeline/index.js", () => ({
  createPipelineContext: mockedCreatePipelineContext,
  runStateMachine: mockedRunStateMachine,
}));

import { generateFromPrompt } from "./generator.js";

const sampleResult: GenerateResult = {
  id: "app-1",
  short_id: "short-1",
  name: "Demo",
  tagline: "Demo app",
  description: "Demo description",
  spec: {
    schema_version: "2",
    name: "Demo",
    tagline: "Demo app",
    description: "Demo description",
    theme: { primary: "#6366f1", style: "light", icon: "Zap" },
    navigation: [{ id: "home", label: "Home", icon: "Home" }],
    screens: [],
  },
  generated_code: "const App = () => <div/>;\nReactDOM.createRoot(document.getElementById('root')).render(<App />);",
  shareUrl: "/share/short-1",
};

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    runId: "run-1",
    prompt: "build me an app",
    model: "kimi",
    state: "INTAKE",
    stateHistory: [],
    contextBrief: null,
    competitorVisuals: null,
    intent: null,
    spec: null,
    contentMap: null,
    generatedCode: null,
    appName: null,
    tagline: null,
    themeColor: null,
    pages: [],
    qualityScore: null,
    qualityBreakdown: null,
    pipelineArtifact: null,
    pipelineSummary: null,
    degraded: false,
    repairCount: 0,
    maxRepairs: 3,
    errors: [],
    onProgress: undefined,
    signal: undefined,
    result: null,
    ...overrides,
  };
}

describe("generateFromPrompt", () => {
  beforeEach(() => {
    process.env.STARTBOX_USE_PIPELINE = "1";
    mockedCreatePipelineContext.mockReset();
    mockedRunStateMachine.mockReset();
  });

  it("returns pipeline result when state machine completes with generated code", async () => {
    const created = makeCtx();
    mockedCreatePipelineContext.mockReturnValue(created);
    mockedRunStateMachine.mockResolvedValue(
      makeCtx({
        state: "COMPLETE",
        result: sampleResult,
      }),
    );

    const result = await generateFromPrompt("build me an app");
    expect(result).toEqual(sampleResult);
    expect(mockedCreatePipelineContext).toHaveBeenCalledWith("build me an app", "kimi", undefined, undefined);
    expect(mockedRunStateMachine).toHaveBeenCalledWith(created);
  });

  it("throws NO_CODE_PRODUCED when pipeline fails without usable code", async () => {
    mockedCreatePipelineContext.mockReturnValue(makeCtx());
    mockedRunStateMachine.mockResolvedValue(
      makeCtx({
        state: "FAILED",
        errors: [],
        result: null,
      }),
    );

    await expect(generateFromPrompt("build me an app")).rejects.toThrow(/NO_CODE_PRODUCED/);
  });

  it("propagates timeout failures", async () => {
    mockedCreatePipelineContext.mockReturnValue(makeCtx());
    mockedRunStateMachine.mockResolvedValue(
      makeCtx({
        state: "FAILED",
        errors: [{ state: "PLANNING", message: "Pipeline timed out after 901s", timestamp: Date.now() }],
      }),
    );

    await expect(generateFromPrompt("build me an app")).rejects.toThrow(/timed out/i);
  });

  it("propagates validation failures after max repairs", async () => {
    mockedCreatePipelineContext.mockReturnValue(makeCtx());
    mockedRunStateMachine.mockResolvedValue(
      makeCtx({
        state: "FAILED",
        generatedCode: "const App = () => <div/>;",
        errors: [{
          state: "VALIDATING",
          message: "Quality gates failed after max repairs: visual uniqueness 20 < 40",
          timestamp: Date.now(),
        }],
      }),
    );

    await expect(generateFromPrompt("build me an app")).rejects.toThrow(/Quality gates failed after max repairs/);
  });
});
