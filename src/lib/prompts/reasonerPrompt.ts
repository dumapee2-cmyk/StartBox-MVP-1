export const TEXT_REASONER_JSON_TEMPLATE = `{
  "normalized_prompt": "clean rephrasing of the user's prompt",
  "app_name_hint": "OriginalName",
  "primary_goal": "1-sentence description of the app's core purpose",
  "domain": "domain category",
  "reference_app": "real competitor if any, otherwise null",
  "design_philosophy": "design approach and UX priorities",
  "target_user": "primary audience",
  "key_differentiator": "what makes this product different",
  "visual_style_keywords": ["keyword1", "keyword2"],
  "premium_features": ["feature1", "feature2"],
  "domain_keywords": ["keyword1", "keyword2", "keyword3"],
  "nav_tabs": [
    {"id": "home", "label": "Home", "icon": "Home", "layout": "dashboard", "purpose": "what this tab does"},
    {"id": "explore", "label": "Explore", "icon": "Search", "layout": "browse", "purpose": "what this tab does"}
  ],
  "primary_color": "#6366f1",
  "theme_style": "light",
  "app_icon": "Zap",
  "output_format_hint": "cards",
  "layout_blueprint": "spatial layout pattern",
  "animation_keywords": ["smooth", "subtle"],
  "visual_requirements": {
    "hero_pattern": "search_hero",
    "card_style": "elevated",
    "data_density": "moderate",
    "color_usage": "full_color"
  },
  "item_display_format": "grid_cards",
  "typography_style": "clean_sans",
  "narrative": "1-2 sentence product description",
  "feature_details": [{"name": "Feature Name", "description": "specific UI behavior"}],
  "reasoning_summary": "brief rationale"
}`;

export function buildReasonerSystemPrompt(): string {
  return `You are a product reasoning model for an app generator.

Goals:
- Extract concrete intent from the user prompt.
- Preserve domain specificity and user terminology.
- Avoid generic template copy and repeated slogans.
- Return pragmatic fields needed for UI/code generation.

Rules:
1. If the user references a known product ("like X"), keep the same domain and core workflows.
2. Generate original, creative app names derived from the domain. Combine domain words, actions, or metaphors into something fresh. Never reuse exact trademark names.
3. Use Lucide React PascalCase icon names only.
4. Provide 2-4 navigation tabs with explicit, buildable purposes.
5. Populate domain_keywords with 6-15 useful terms (deduped, no filler).
6. Keep token guidance consistent: generated code should use only --sb-* CSS custom properties.
7. Do not enforce hardcoded headlines, repeated copy snippets, or mandatory placeholder-only imagery.
8. Return valid JSON only.`;
}

export function buildReasonerUserPrompt(prompt: string, contextSection = ""): string {
  return `Analyze this app request and return structured intent JSON.\n\n"${prompt}"${contextSection}\n\nRespond with a single JSON object matching this structure:\n${TEXT_REASONER_JSON_TEMPLATE}\n\nConstraints:\n- Include domain_keywords (6-15 terms) tied to this prompt.\n- Use only realistic, domain-appropriate labels/copy.\n- No markdown, no backticks, no prose outside JSON.`;
}
