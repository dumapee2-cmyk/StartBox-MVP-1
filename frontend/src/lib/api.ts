const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function parseResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message ?? 'Request failed'), { status: res.status });
  return data as T;
}

// ── AppSpec v2 Types ─────────────────────────────────────────

export type InputFieldType = 'text' | 'textarea' | 'select' | 'number';
export type LayoutType = 'tool' | 'analyzer' | 'generator' | 'dashboard' | 'planner';
export type OutputFormat = 'markdown' | 'cards' | 'score_card' | 'report' | 'list' | 'plain';

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
  schema_version: '2';
  name: string;
  tagline: string;
  description: string;
  theme: {
    primary: string;
    style: 'light' | 'dark' | 'vibrant';
    icon: string;
  };
  navigation: NavItem[];
  screens: Screen[];
}

export interface AppRecord {
  id: string;
  short_id: string;
  name: string;
  tagline?: string;
  description: string;
  spec: AppSpec;
  original_prompt: string;
  forked_from: string | null;
  generated_code?: string;
  theme_color?: string;
  run_count: number;
  created_at: string;
  shareUrl: string;
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

export interface AppRunOutput {
  text: string;
  format: OutputFormat;
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

export const api = {
  generate: (prompt: string, model: 'sonnet' | 'opus' = 'sonnet') =>
    fetch('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, model }),
      headers: JSON_HEADERS,
    }).then((r) => parseResponse<GenerateResult>(r)),

  getApp: (id: string) =>
    fetch(`/api/apps/${id}`).then((r) => parseResponse<AppRecord>(r)),

  getByShortId: (shortId: string) =>
    fetch(`/api/share/${shortId}`).then((r) => parseResponse<AppRecord>(r)),

  getRecent: () =>
    fetch('/api/apps').then((r) => parseResponse<RecentApp[]>(r)),

  runApp: (id: string, inputs: Record<string, string>, navId?: string) =>
    fetch(`/api/apps/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({ inputs, nav_id: navId }),
      headers: JSON_HEADERS,
    }).then((r) => parseResponse<RunResult>(r)),

  forkApp: (id: string) =>
    fetch(`/api/apps/${id}/fork`, { method: 'POST' }).then((r) => parseResponse<GenerateResult>(r)),

  refineApp: (id: string, instruction: string) =>
    fetch(`/api/apps/${id}/refine`, {
      method: 'POST',
      body: JSON.stringify({ instruction }),
      headers: JSON_HEADERS,
    }).then((r) => parseResponse<{ updated_code: string }>(r)),
};
