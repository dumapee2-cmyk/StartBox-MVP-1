import { describe, expect, it } from "vitest";
import { orchestrateChatInstruction } from "./chatOrchestrator.js";

describe("chat orchestrator clarify contract", () => {
  it("returns clarify action and questions for vague prompt with no app", async () => {
    const previous = process.env.STARTBOX_ORCHESTRATOR_USE_LLM;
    process.env.STARTBOX_ORCHESTRATOR_USE_LLM = "false";

    const out = await orchestrateChatInstruction({
      prompt: "build an app",
      has_app: false,
    });

    process.env.STARTBOX_ORCHESTRATOR_USE_LLM = previous;

    expect(out.action).toBe("clarify");
    expect(Array.isArray(out.clarifying_questions)).toBe(true);
    expect((out.clarifying_questions ?? []).length).toBeGreaterThan(0);
  });
});
