const JSON_HEADERS = { 'Content-Type': 'application/json' };

function normalizeErrorMessage(status: number, statusText: string, fallback: string) {
  return `${fallback} (${status}${statusText ? ` ${statusText}` : ''})`;
}

async function readResponsePayload(res: Response): Promise<unknown> {
  const raw = await res.text();
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const payload = await readResponsePayload(res);
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const msg = (payload as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  if (typeof payload === 'string') {
    const text = payload.trim();
    if (text) return text.slice(0, 300);
  }
  return normalizeErrorMessage(res.status, res.statusText, fallback);
}

async function parseResponse<T>(res: Response): Promise<T> {
  const payload = await readResponsePayload(res);
  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload && typeof (payload as { message?: unknown }).message === 'string'
        ? ((payload as { message: string }).message || 'Request failed')
        : normalizeErrorMessage(res.status, res.statusText, 'Request failed');
    throw Object.assign(new Error(message), { status: res.status });
  }
  if (payload === null) {
    throw Object.assign(new Error('Empty response payload'), { status: res.status });
  }
  if (typeof payload === 'string') {
    throw Object.assign(new Error('Invalid JSON response payload'), { status: res.status });
  }
  return payload as T;
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
  latest_quality_score?: number | null;
  latest_pipeline_summary?: string | null;
  run_count: number;
  created_at: string;
  shareUrl: string;
}

export interface QualityBreakdown {
  layout_diversity: number;
  visual_uniqueness: number;
  domain_specificity: number;
  navigation_correctness: number;
  interaction_richness: number;
  visual_richness: number;
  form_styling: number;
  content_layout_fit: number;
}

export interface GenerateResult {
  id: string;
  short_id: string;
  name: string;
  tagline: string;
  description: string;
  spec: AppSpec;
  generated_code?: string;
  pipeline_run_id?: string;
  quality_score?: number;
  quality_breakdown?: QualityBreakdown;
  latest_pipeline_summary?: string;
  model_requested?: 'auto' | 'kimi' | 'sonnet' | 'opus';
  model_resolved?: string;
  provider_resolved?: 'kimi' | 'anthropic' | 'unknown' | string;
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

export interface AppVersion {
  id: string;
  app_id: string;
  label: string;
  source: 'generate' | 'refine' | 'restore';
  created_at: string;
}

export interface PipelineRunArtifact {
  id: string;
  app_id: string;
  prompt: string;
  intent: unknown;
  artifact: unknown;
  quality_score: number;
  quality_breakdown?: QualityBreakdown;
  created_at: string;
}

// ── SSE streaming types ──

export type ProgressEventType = 'status' | 'narrative' | 'plan' | 'writing' | 'created' | 'quality' | 'done' | 'error';

export interface ProgressEvent {
  type: ProgressEventType;
  message: string;
  data?: Record<string, unknown>;
}

export function generateStream(
  prompt: string,
  model: 'auto' | 'kimi' | 'sonnet' | 'opus' = 'auto',
  onEvent: (event: ProgressEvent) => void,
): { promise: Promise<void>; abort: () => void } {
  const controller = new AbortController();

  const promise = (async () => {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { ...JSON_HEADERS, Accept: 'text/event-stream' },
      body: JSON.stringify({ prompt, model }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const message = await readErrorMessage(res, 'Generation failed');
      throw new Error(message);
    }

    if (!res.body) {
      throw new Error('Generation stream unavailable (empty response body)');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sawAnyEvent = false;
    let sawTerminalEvent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6)) as ProgressEvent;
            sawAnyEvent = true;
            if (event.type === 'done' || event.type === 'error') sawTerminalEvent = true;
            onEvent(event);
          } catch { /* ignore parse errors */ }
        }
      }
    }

    if (!sawAnyEvent) {
      throw new Error('Generation stream closed before any events were received.');
    }
    if (!sawTerminalEvent) {
      throw new Error('Generation stream ended unexpectedly before completion.');
    }
  })();

  return { promise, abort: () => controller.abort() };
}

// ── Clarification ──

export interface ClarifyQuestion {
  question: string;
  options: string[];
}

export interface ClarifyResult {
  clear: boolean;
  questions?: ClarifyQuestion[];
}

export interface OrchestrateRequest {
  prompt: string;
  has_app: boolean;
  workbench_mode?: 'build' | 'visual_edit' | 'discuss';
}

export interface OrchestrateResult {
  action: 'generate' | 'refine' | 'discuss' | 'clarify';
  optimized_text: string;
  assistant_message: string;
  clarifying_questions?: string[];
  suggested_mode?: 'build' | 'visual_edit' | 'discuss';
}

export async function clarifyPrompt(prompt: string): Promise<ClarifyResult> {
  const res = await fetch('/api/clarify', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) return { clear: true }; // fail-open
  const payload = await readResponsePayload(res);
  if (!payload || typeof payload !== 'object') return { clear: true };
  return payload as ClarifyResult;
}

export const api = {
  generate: (prompt: string, model: 'auto' | 'kimi' | 'sonnet' | 'opus' = 'auto') =>
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

  refineApp: (id: string, instruction: string, mode: 'build' | 'visual_edit' | 'discuss') =>
    fetch(`/api/apps/${id}/refine`, {
      method: 'POST',
      body: JSON.stringify({ instruction, mode }),
      headers: JSON_HEADERS,
    }).then((r) => parseResponse<{ updated_code?: string; advisory?: string; mode: 'build' | 'visual_edit' | 'discuss' }>(r)),

  getVersions: (id: string) =>
    fetch(`/api/apps/${id}/versions`).then((r) => parseResponse<AppVersion[]>(r)),

  restoreVersion: (id: string, versionId: string) =>
    fetch(`/api/apps/${id}/versions/${versionId}/restore`, { method: 'POST' }).then((r) => parseResponse<{ restored: boolean }>(r)),

  getPipelineRun: (id: string, runId: string) =>
    fetch(`/api/apps/${id}/pipeline-runs/${runId}`).then((r) => parseResponse<PipelineRunArtifact>(r)),

  orchestrateChat: (body: OrchestrateRequest, signal?: AbortSignal) =>
    fetch('/api/agent/orchestrate', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: JSON_HEADERS,
      signal,
    }).then((r) => parseResponse<OrchestrateResult>(r)),
};
