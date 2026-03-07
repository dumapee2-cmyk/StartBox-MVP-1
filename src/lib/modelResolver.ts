/**
 * Centralized model resolution — picks model IDs based on env overrides.
 */

export type ModelTier = "fast" | "standard" | "premium";

const MODEL_ID = "kimi-k2.5";

const TIER_ENV_KEYS: Record<ModelTier, string> = {
  fast: "AI_MODEL_FAST",
  standard: "AI_MODEL_STANDARD",
  premium: "AI_MODEL_PREMIUM",
};

/**
 * Resolve a model ID for the given tier, respecting env overrides first,
 * then falling back to the default model.
 */
export function resolveModel(tier: ModelTier): string {
  const envValue = process.env[TIER_ENV_KEYS[tier]];
  if (envValue) return envValue;
  return MODEL_ID;
}
