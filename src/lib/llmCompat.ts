/**
 * LLM compatibility layer — handles thinking model output extraction
 * and structured telemetry logging for Kimi K2.5 via Moonshot API.
 */

/**
 * Structured telemetry log for every LLM call site.
 */
export function llmLog(feature: string, extras?: Record<string, unknown>): void {
  const parts = [`[LLM] provider=kimi, mode=json, feature=${feature}`];
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      parts.push(`${k}=${String(v)}`);
    }
  }
  console.log(parts.join(", "));
}

/**
 * Strip thinking-model tags from text responses.
 * Kimi K2.5 emits <think>...</think> blocks that contain internal
 * reasoning — not the actual output.
 */
export function stripThinkingContent(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Handle unclosed <think> (model hit token limit mid-thought)
  cleaned = cleaned.replace(/<think>[\s\S]*/gi, "");
  return cleaned.trim();
}

/**
 * Extract usable text from an Anthropic SDK response content array.
 * Filters out thinking blocks and strips residual <think> tags.
 */
export function extractTextFromResponse(
  content: Array<{ type: string; text?: string; thinking?: string }>,
): string {
  const textParts: string[] = [];
  for (const block of content) {
    if (block.type === "thinking") continue;
    if (block.type === "text" && block.text) {
      textParts.push(block.text);
    }
  }
  return stripThinkingContent(textParts.join("\n")).trim();
}

/** Extract JSON from a text response (handles markdown code blocks and thinking tags). */
export function extractJSON(text: string): string {
  const cleaned = stripThinkingContent(text);
  const fenced = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) {
    const candidate = fenced[1].trim();
    try { JSON.parse(candidate); return candidate; } catch { /* not valid JSON, continue */ }
  }
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { JSON.parse(objMatch[0]); return objMatch[0].trim(); } catch { /* not valid JSON */ }
  }
  return cleaned.trim();
}

/**
 * Extract code content from markdown fences in a text response.
 * Returns the fenced code content, or null if no code fences found.
 */
export function extractCodeFromFences(text: string): string | null {
  const cleaned = stripThinkingContent(text);
  const fenced = cleaned.match(/```(?:jsx?|tsx?|javascript)?\s*\n([\s\S]*?)\n```/);
  if (fenced && fenced[1].trim().length > 50) {
    return fenced[1].trim();
  }
  return null;
}
