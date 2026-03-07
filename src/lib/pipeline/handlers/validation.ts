import type { PipelineContext, StateTransition } from "../types.js";
import { scoreFactoryDimensions } from "../../qualityScorer.js";

/**
 * VALIDATING state: run four-dimension factory scoring and decide next state.
 *
 * The code has already been through internal quality scoring and repair
 * inside generateReactCode. This validation adds a safety net for security
 * issues, critical code quality problems, and bland/generic output gating.
 *
 * Score thresholds (deterministic — no LLM decides):
 *   Security < 60:                            REPAIRING (security issues are critical)
 *   Code quality < 50:                        REPAIRING (severe runtime/structural issues)
 *   Fatal factory issues:                      REPAIRING/FAILED based on remaining retries
 *   Degraded + overall quality < 35:          FAILED (broken degraded output should not ship)
 *   Otherwise:                                FINALIZING (trust the internal quality checks)
 */
export async function handleValidation(ctx: PipelineContext): Promise<StateTransition> {
  if (!ctx.generatedCode) {
    ctx.errors.push({
      state: "VALIDATING",
      message: "No generated code available during validation (NO_CODE_PRODUCED)",
      timestamp: Date.now(),
    });
    return { nextState: "FAILED" };
  }

  // Run four-dimension factory scoring (Code Quality, Design, Security, Performance)
  try {
    const factory = scoreFactoryDimensions(ctx.generatedCode, ctx.prompt);
    ctx.latestFactoryIssues = factory.issues;
    console.log(
      `Factory scores — Code: ${factory.code_quality}, Design: ${factory.design_quality}, ` +
      `Security: ${factory.security}, Performance: ${factory.performance}, Overall: ${factory.overall}`
    );
    if (factory.issues.length > 0) {
      console.log(`Factory issues: ${factory.issues.join(' | ')}`);
    }

    const hasFatalFactoryIssue = factory.issues.some((issue) => issue.startsWith("FATAL:"));
    if (hasFatalFactoryIssue) {
      if (ctx.repairCount < ctx.maxRepairs) {
        console.log("Fatal factory issue detected — triggering repair");
        ctx.onProgress?.({ type: "status", message: "Critical build issue detected — repairing..." });
        return { nextState: "REPAIRING" };
      }

      const fatalDetail = factory.issues.filter((issue) => issue.startsWith("FATAL:")).join("; ");
      console.log(`Fatal factory issue persisted after max repairs — failing: ${fatalDetail}`);
      ctx.onProgress?.({ type: "status", message: "Generation quality too low — please retry" });
      ctx.errors.push({
        state: "VALIDATING",
        message: `Fatal validation checks failed after max repairs: ${fatalDetail}`,
        timestamp: Date.now(),
      });
      return { nextState: "FAILED" };
    }

    // Trigger repair for critical security issues or severe code quality problems.
    if (factory.security < 60 && ctx.repairCount < ctx.maxRepairs) {
      console.log(`Security score ${factory.security} < 60 — triggering repair (dimension: security)`);
      ctx.onProgress?.({ type: "status", message: `Security check: fixing issues...` });
      return { nextState: "REPAIRING" };
    }
    if (factory.code_quality < 50 && ctx.repairCount < ctx.maxRepairs) {
      console.log(`Code quality score ${factory.code_quality} < 50 — triggering repair (dimension: code_quality)`);
      ctx.onProgress?.({ type: "status", message: `Quality check: fixing code issues...` });
      return { nextState: "REPAIRING" };
    }
  } catch (e) {
    // Factory scoring is a safety net — if it fails, proceed with the code we have
    console.warn("Factory scoring failed (non-fatal):", e instanceof Error ? e.message : e);
    ctx.latestFactoryIssues = null;
  }

  // Stricter gate for degraded mode — avoid shipping obviously broken fallback output.
  // Keep this narrow so Kimi generation decisions lead more than heuristic style gates.
  const score = ctx.qualityScore ?? 0;
  if (ctx.degraded && score < 35) {
    console.log(`Degraded mode + quality ${score} < 35 — failing`);
    ctx.onProgress?.({ type: "status", message: "Generation quality too low — please retry" });
    ctx.errors.push({
      state: "VALIDATING",
      message: `Degraded generation with quality score ${score} is below minimum threshold (35). Please retry.`,
      timestamp: Date.now(),
    });
    return { nextState: "FAILED" };
  }

  ctx.onProgress?.({ type: "status", message: `Quality check: ${score}/100` });

  return { nextState: "FINALIZING" };
}
