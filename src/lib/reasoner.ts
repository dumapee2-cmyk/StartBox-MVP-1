import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const reasonedIntentSchema = z.object({
  normalized_prompt: z.string().min(1),
  app_name_hint: z.string().min(1),
  primary_goal: z.string().min(1),
  domain: z.string().min(1),
  reference_app: z.string().optional(),
  design_philosophy: z.string().min(1),
  nav_tabs: z.array(z.object({
    id: z.string(),
    label: z.string(),
    icon: z.string(),
    layout: z.enum(["tool", "analyzer", "generator", "dashboard", "planner"]),
    purpose: z.string(),
  })).min(2).max(4),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  theme_style: z.enum(["light", "dark", "vibrant"]),
  app_icon: z.string().min(1).max(4),
  output_format_hint: z.enum(["markdown", "cards", "score_card", "report", "list", "plain"]),
  reasoning_summary: z.string().min(1),
});

export type ReasonedIntent = z.infer<typeof reasonedIntentSchema>;

const REASONER_SYSTEM_PROMPT = `You are an elite AI product designer who deeply understands consumer apps, SaaS tools, and AI services.

Your job: analyze a user's app idea and extract PRECISE structured intent for building a polished, commercially-viable AI product.

━━━ REFERENCE APP KNOWLEDGE ━━━
When users reference real apps, extract their DESIGN PHILOSOPHY and UX PATTERNS (not their IP):

FITNESS & HEALTH:
• "Cal AI", "calorie scanner", "food tracker", "macro app" → scan/analyze food, show macro breakdown with score cards, progress tracking. Layout: photo/text input → instant analysis → nutrient score card + detailed breakdown. Colors: #22c55e (energetic green) or #f97316 (orange). Icon: 🥗 or 💪
• "Strava", "running app", "workout tracker" → activity logging, performance metrics, streak tracking. Colors: #f97316. Icon: 🏃
• "MyFitnessPal", "diet tracker" → food logging, calorie counting, goal tracking. Colors: #3b82f6. Icon: 🎯

PROFESSIONAL & CAREER:
• "Resume scanner", "ATS checker", "job tool" → paste resume → keyword analysis + score card + improvement list. Colors: #1e40af. Icon: 📄
• "Cover letter generator", "job application" → job description + background → polished letter. Colors: #4f46e5. Icon: ✉️
• "LinkedIn optimizer", "profile builder" → input sections → optimized content output. Colors: #0077b5. Icon: 💼

BUSINESS & FINANCE:
• "Pricing tool", "quote generator", "cost calculator" → multi-field inputs → detailed pricing breakdown cards. Colors: #059669. Icon: 💰
• "Invoice generator", "billing tool" → client info → formatted invoice/proposal. Colors: #1e40af. Icon: 🧾
• "Market analyzer", "competitor research" → company/product input → structured market report. Colors: #7c3aed. Icon: 📊

CONTENT & MARKETING:
• "Caption generator", "social media tool", "content creator" → brief + platform → multiple styled variants as cards. Colors: #ec4899 or #8b5cf6. Icon: ✨
• "Email tool", "cold outreach", "email writer" → context fields → polished email variants. Colors: #4f46e5. Icon: 📧
• "SEO tool", "keyword analyzer", "content optimizer" → URL/content → score card + opportunity list. Colors: #f59e0b. Icon: 🔍
• "Ad copy generator", "marketing copy" → product + audience → multiple copy variants. Colors: #ef4444. Icon: 📢

LEGAL & COMPLIANCE:
• "Contract reviewer", "legal analyzer", "terms summarizer" → paste document → risk flags as cards + plain language summary. Colors: #1e3a5f. Icon: ⚖️

EDUCATION & LEARNING:
• "Flashcard generator", "study tool", "quiz maker" → topic/text → study cards. Colors: #4f46e5. Icon: 🎓
• "Essay grader", "writing feedback" → paste text → score card + detailed feedback. Colors: #7c3aed. Icon: ✏️

AI & PRODUCTIVITY:
• "Meeting summarizer", "transcript analyzer" → paste transcript → action items list + summary. Colors: #0f172a. Icon: 📝
• "Task planner", "project breakdown" → goal description → structured task plan. Colors: #0891b2. Icon: 📋

━━━ LAYOUT SELECTION RULES ━━━
• "analyzer" → app SCANS something and returns a score/breakdown (food scanner, resume checker, SEO analyzer, essay grader)
• "generator" → app CREATES content (email writer, caption generator, cover letter, ad copy)
• "tool" → app CALCULATES or CONVERTS (pricing calculator, unit converter)
• "dashboard" → app shows OVERVIEW stats + main action
• "planner" → app builds STRUCTURED PLANS (meal planner, study schedule)

━━━ OUTPUT FORMAT RULES ━━━
• "score_card" → output includes a score/grade + breakdown (resume scorer, food analyzer)
• "cards" → output is multiple distinct items (SEO keywords, email variants, content ideas, flashcards)
• "report" → detailed narrative (contract review, market analysis)
• "list" → ordered steps or checklist (action items, task breakdown)
• "markdown" → default rich formatted content
• "plain" → simple conversational response

━━━ NAVIGATION RULES ━━━
ALWAYS generate 2-4 tabs. NEVER just 1.
Tab 1: Main action/tool (the core feature)
Tab 2: Secondary action OR history/results view
Tab 3 (optional): Related tool or plans/reports

━━━ QUALITY STANDARD ━━━
This app must feel like a COMMERCIAL PRODUCT someone would pay for. All field labels must be domain-specific. No generic placeholders. No chatbox interfaces.

Extract the user's intent even if their prompt has typos or is vague. Infer from context.`;

const toolInputSchema = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    normalized_prompt: { type: "string" },
    app_name_hint: { type: "string" },
    primary_goal: { type: "string" },
    domain: { type: "string" },
    reference_app: { type: "string" },
    design_philosophy: { type: "string" },
    nav_tabs: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          icon: { type: "string" },
          layout: { type: "string", enum: ["tool", "analyzer", "generator", "dashboard", "planner"] },
          purpose: { type: "string" },
        },
        required: ["id", "label", "icon", "layout", "purpose"],
      },
    },
    primary_color: { type: "string" },
    theme_style: { type: "string", enum: ["light", "dark", "vibrant"] },
    app_icon: { type: "string" },
    output_format_hint: { type: "string", enum: ["markdown", "cards", "score_card", "report", "list", "plain"] },
    reasoning_summary: { type: "string" },
  },
  required: [
    "normalized_prompt", "app_name_hint", "primary_goal", "domain",
    "design_philosophy", "nav_tabs", "primary_color", "theme_style",
    "app_icon", "output_format_hint", "reasoning_summary",
  ],
};

export async function translateEnglishPromptWithReasoning(prompt: string): Promise<ReasonedIntent | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: REASONER_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `Analyze this app idea and extract precise build intent:\n\n"${prompt}"\n\nReturn structured intent for building this as a polished AI product.`,
      }],
      tools: [{
        name: "extract_intent",
        description: "Extract structured app-building intent from a prompt",
        input_schema: toolInputSchema,
      }],
      tool_choice: { type: "tool", name: "extract_intent" },
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;

    return reasonedIntentSchema.parse(toolUse.input);
  } catch {
    return null;
  }
}
