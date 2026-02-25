export type InputFieldType = "text" | "textarea" | "select" | "number";
export type LayoutType = "tool" | "analyzer" | "generator" | "dashboard" | "planner";
export type OutputFormat = "markdown" | "cards" | "score_card" | "report" | "list" | "plain";

export interface InputField {
  key: string;
  label: string;
  type: InputFieldType;
  placeholder?: string;
  options?: string[];
  required: boolean;
  max_length?: number;
}

export interface AILogic {
  system_prompt: string;
  context_template: string;
  temperature: number;
  max_tokens: number;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

export interface Screen {
  nav_id: string;
  layout: LayoutType;
  hero: {
    title: string;
    subtitle: string;
    cta_label: string;
  };
  input_fields: InputField[];
  ai_logic: AILogic;
  output_format: OutputFormat;
  output_label: string;
}

export interface AppSpec {
  schema_version: "2";
  name: string;
  tagline: string;
  description: string;
  theme: {
    primary: string;
    style: "light" | "dark" | "vibrant";
    icon: string;
  };
  navigation: NavItem[];
  screens: Screen[];
}

export interface AppRunOutput {
  text: string;
  format: OutputFormat;
}

export interface GenerateResult {
  id: string;
  short_id: string;
  name: string;
  tagline: string;
  description: string;
  spec: AppSpec;
  generated_code?: string;
  shareUrl: string;
}

export interface RunResult {
  run_id: string;
  output: AppRunOutput;
  tokens_used: number;
  duration_ms: number;
}

export interface RecentApp {
  id: string;
  short_id: string;
  name: string;
  tagline?: string;
  theme_color?: string;
  run_count: number;
  created_at: string;
}
