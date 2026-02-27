import type { OutputFormat, QualityBreakdown } from "../types/index.js";

export interface QualityScoreInput {
  code: string;
  prompt: string;
  outputFormat: OutputFormat;
}

const WEIGHTS: Record<keyof QualityBreakdown, number> = {
  visual_hierarchy: 0.2,
  domain_specificity: 0.15,
  responsiveness: 0.15,
  interaction_richness: 0.15,
  component_completeness: 0.15,
  brand_cohesion: 0.1,
  output_format_compliance: 0.1,
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function hasAny(code: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(code));
}

export function scoreGeneratedCode(input: QualityScoreInput): {
  quality_score: number;
  quality_breakdown: QualityBreakdown;
} {
  const code = input.code;
  const promptTokens = new Set(
    input.prompt
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3),
  );
  const codeLower = code.toLowerCase();

  const layoutSignals = [
    /max-w-[0-9a-z-]+/,
    /grid-cols-/,
    /rounded-(xl|2xl|3xl)/,
    /shadow-(sm|md|lg|xl)/,
    /tracking-/,
    /text-(2xl|3xl|4xl)/,
  ];
  const responsiveSignals = [/sm:/, /md:/, /lg:/, /xl:/, /overflow-x-auto/, /whitespace-nowrap/];
  const interactionSignals = [/onClick=/, /onChange=/, /transition/, /hover:/, /animate/, /useState/];
  const completenessSignals = [/error/i, /loading/i, /empty/i, /history/i, /copy/i, /localStorage/];
  const brandSignals = [/linear-gradient/, /primaryColor/, /--app-color/, /style=\{\{[^}]*background/i];

  let promptTokenMatches = 0;
  for (const token of promptTokens) {
    if (codeLower.includes(token)) promptTokenMatches += 1;
  }
  const domainSpecificityRatio = promptTokens.size ? promptTokenMatches / promptTokens.size : 0.5;

  const outputFormatSignals: Record<OutputFormat, RegExp[]> = {
    markdown: [/##\s/, /\*\*/, /-\s/],
    cards: [/card/i, /grid/i, /variant/i],
    score_card: [/score/i, /grade/i, /ring/i],
    report: [/section/i, /summary/i, /analysis/i],
    list: [/\d+\./, /-\s/, /checklist/i],
    plain: [/paragraph/i, /text/i],
  };

  const breakdown: QualityBreakdown = {
    visual_hierarchy: clampScore((layoutSignals.filter((p) => p.test(code)).length / layoutSignals.length) * 100),
    domain_specificity: clampScore(domainSpecificityRatio * 100),
    responsiveness: clampScore((responsiveSignals.filter((p) => p.test(code)).length / responsiveSignals.length) * 100),
    interaction_richness: clampScore((interactionSignals.filter((p) => p.test(code)).length / interactionSignals.length) * 100),
    component_completeness: clampScore((completenessSignals.filter((p) => p.test(code)).length / completenessSignals.length) * 100),
    brand_cohesion: clampScore((brandSignals.filter((p) => p.test(code)).length / brandSignals.length) * 100),
    output_format_compliance: clampScore(
      hasAny(code, outputFormatSignals[input.outputFormat]) ? 90 : 40,
    ),
  };

  const weighted =
    breakdown.visual_hierarchy * WEIGHTS.visual_hierarchy +
    breakdown.domain_specificity * WEIGHTS.domain_specificity +
    breakdown.responsiveness * WEIGHTS.responsiveness +
    breakdown.interaction_richness * WEIGHTS.interaction_richness +
    breakdown.component_completeness * WEIGHTS.component_completeness +
    breakdown.brand_cohesion * WEIGHTS.brand_cohesion +
    breakdown.output_format_compliance * WEIGHTS.output_format_compliance;

  return {
    quality_score: clampScore(weighted),
    quality_breakdown: breakdown,
  };
}
