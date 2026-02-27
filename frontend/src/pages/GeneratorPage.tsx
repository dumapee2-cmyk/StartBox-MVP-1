import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, generateStream, type AppRecord, type GenerateResult, type ProgressEvent } from '../lib/api';
import { AppPreview } from '../components/AppPreview';
import { FloatingIcons } from '../components/FloatingIcons';
import { StartBoxLogo } from '../components/StartBoxLogo';
import { DashboardSidebar } from '../components/dashboard/DashboardSidebar';
import { OverviewSection } from '../components/dashboard/sections/OverviewSection';
import { CodeSection } from '../components/dashboard/sections/CodeSection';
import { AnalyticsSection } from '../components/dashboard/sections/AnalyticsSection';
import { SettingsSection } from '../components/dashboard/sections/SettingsSection';
import { PlaceholderSection } from '../components/dashboard/sections/PlaceholderSection';

type ChatRole = 'user' | 'ai';
type ChatType = 'message' | 'error' | 'narrative' | 'plan' | 'building' | 'writing' | 'created' | 'quality';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  type: ChatType;
  timestamp: number;
  data?: Record<string, unknown>;
}

interface PlanData {
  app_name: string;
  domain: string;
  design: string;
  features: string[];
  feature_details: Array<{ name: string; description: string }>;
  tabs: string[];
}

const PLACEHOLDER_INFO: Record<string, { title: string; description: string; icon: string }> = {
  users: { title: 'Users', description: 'Manage user access, roles, and permissions for your application.', icon: 'Users' },
  data: { title: 'Data', description: 'View and manage your application data, entities, and records.', icon: 'Database' },
  domains: { title: 'Domains', description: 'Connect custom domains and manage DNS settings.', icon: 'Globe' },
  integrations: { title: 'Integrations', description: 'Connect third-party services and APIs to your app.', icon: 'Plug' },
  security: { title: 'Security', description: 'Configure authentication, authorization, and security policies.', icon: 'Shield' },
  agents: { title: 'Agents', description: 'Create and manage AI agents that power your application.', icon: 'Bot' },
  automations: { title: 'Automations', description: 'Set up automated workflows and triggers.', icon: 'Zap' },
  logs: { title: 'Logs', description: 'Monitor application logs, errors, and system events.', icon: 'ScrollText' },
  api: { title: 'API', description: 'Access your application API endpoints and documentation.', icon: 'Terminal' },
};

const DID_YOU_KNOW_TIPS = [
  'StartBox apps are built with production-ready code and modern SaaS styling.',
  'Every generated app includes AI-powered features out of the box.',
  'Apps are built with responsive layouts that work on any screen size.',
  'Our quality pipeline scores each app on 7 different dimensions.',
  'You can refine your app with Build, Visual, and Discuss modes.',
  'Generated apps include pre-populated demo data for instant previewing.',
];

const STARTER_PROMPTS = [
  'Build a project management tool',
  'Create a personal finance tracker',
  'Make a recipe organizer app',
  'Build a customer CRM dashboard',
];

const MODEL_OPTIONS: Array<{ id: 'sonnet' | 'opus'; name: string; shortName: string; desc: string }> = [
  { id: 'sonnet', name: 'Claude Sonnet 4.6', shortName: 'Sonnet 4.6', desc: 'Fast & high quality' },
  { id: 'opus', name: 'Claude Opus 4.6', shortName: 'Opus 4.6', desc: 'Maximum quality' },
];

function ClaudeLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M8 1.5v5M8 9.5v5M1.5 8h5M9.5 8h5M3.4 3.4l3.5 3.5M9.1 9.1l3.5 3.5M12.6 3.4l-3.5 3.5M6.9 9.1l-3.5 3.5"
        stroke="#e8734a"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

let msgCounter = 0;
function newId() { return String(++msgCounter); }

// ── sessionStorage helpers ──
const SS_KEY = 'sb_gen_state';

interface PersistedState {
  generatedApp: GenerateResult | null;
  liveCode: string | null;
  chatHistory: ChatMessage[];
  selectedModel: 'sonnet' | 'opus';
  workbenchMode: 'build' | 'visual_edit' | 'discuss';
}

function saveState(s: PersistedState) {
  try { sessionStorage.setItem(SS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function loadState(): PersistedState | null {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.chatHistory.length > 0) {
        const maxId = Math.max(...parsed.chatHistory.map((m) => Number(m.id) || 0));
        msgCounter = maxId;
      }
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

export function GeneratorPage() {
  const restored = useRef(loadState());
  const [prompt, setPrompt] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(restored.current?.chatHistory ?? []);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [generatedApp, setGeneratedApp] = useState<GenerateResult | null>(restored.current?.generatedApp ?? null);
  const [liveCode, setLiveCode] = useState<string | null>(restored.current?.liveCode ?? null);
  const [selectedModel, setSelectedModel] = useState<'sonnet' | 'opus'>(restored.current?.selectedModel ?? 'sonnet');
  const [shareCopied, setShareCopied] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<'preview' | 'dashboard'>('preview');
  const [activeSection, setActiveSection] = useState('overview');
  const [fullApp, setFullApp] = useState<AppRecord | null>(null);
  const [workbenchMode, setWorkbenchMode] = useState<'build' | 'visual_edit' | 'discuss'>(restored.current?.workbenchMode ?? 'build');
  const [previewRefreshTick, setPreviewRefreshTick] = useState(0);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // ── Streaming state (transient only — events go into chatHistory) ──
  const [statusMessage, setStatusMessage] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [genStartTime, setGenStartTime] = useState<number | null>(null);
  const planRef = useRef<PlanData | null>(null);

  // ── Event queue for anti-batching ──
  const eventQueueRef = useRef<ProgressEvent[]>([]);
  const processingRef = useRef(false);

  // Persist state on change
  useEffect(() => {
    saveState({ generatedApp, liveCode, chatHistory, selectedModel, workbenchMode });
  }, [generatedApp, liveCode, chatHistory, selectedModel, workbenchMode]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Close model dropdown on click outside
  useEffect(() => {
    if (!modelDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [modelDropdownOpen]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, suggestions]);

  // Rotate tips during generation
  useEffect(() => {
    if (!generating) return;
    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % DID_YOU_KNOW_TIPS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [generating]);

  async function refreshAppData(appId: string) {
    try {
      const app = await api.getApp(appId);
      setFullApp(app);
    } catch { /* best effort */ }
  }

  useEffect(() => {
    if (generatedApp?.id) {
      void refreshAppData(generatedApp.id);
    }
  }, [generatedApp?.id]);

  function addMessage(role: ChatRole, content: string, type: ChatType = 'message') {
    setChatHistory((prev) => [...prev, { id: newId(), role, content, type, timestamp: Date.now() }]);
  }

  // ── Event queue processor — events become persistent chat messages ──
  function processNext() {
    if (!mountedRef.current) { processingRef.current = false; return; }
    const event = eventQueueRef.current.shift();
    if (!event) { processingRef.current = false; return; }

    let delay = 0;
    switch (event.type) {
      case 'status':
        setStatusMessage(event.message);
        delay = 0;
        break;
      case 'narrative':
        setChatHistory((prev) => [
          ...prev,
          { id: newId(), role: 'ai', content: event.message, type: 'narrative', timestamp: Date.now(), data: event.data },
        ]);
        delay = 400;
        break;
      case 'plan': {
        const plan = event.data as unknown as PlanData;
        planRef.current = plan;
        // Build flowing narrative text instead of a structured card
        const featureDetails = plan.feature_details ?? [];
        const features = featureDetails.length > 0
          ? featureDetails.map((f, i) => `${i + 1}. ${f.name} — ${f.description}`).join('\n')
          : (plan.features ?? []).map((f, i) => `${i + 1}. ${f}`).join('\n');
        const planText = [
          `**${plan.app_name}**`,
          `${plan.domain}${plan.design ? ' · ' + plan.design : ''}`,
          '',
          'Key Features:',
          features,
          '',
          `Pages: ${(plan.tabs ?? []).join(', ')}`,
        ].join('\n');
        setChatHistory((prev) => [
          ...prev,
          { id: newId(), role: 'ai', content: planText, type: 'plan', timestamp: Date.now(), data: event.data },
        ]);
        delay = 300;
        break;
      }
      case 'writing':
        setChatHistory((prev) => {
          const isMilestone = !!(event.data?.milestone);
          const content = isMilestone ? event.message : ((event.data?.path as string) ?? (event.data?.component as string) ?? event.message);
          if (prev.some((m) => m.type === 'writing' && m.content === content)) return prev;
          return [...prev, { id: newId(), role: 'ai', content, type: 'writing', timestamp: Date.now(), data: event.data }];
        });
        delay = event.data?.milestone ? 250 : 180;
        break;
      case 'created':
        setChatHistory((prev) => [
          ...prev,
          { id: newId(), role: 'ai', content: 'Created', type: 'created', timestamp: Date.now() },
        ]);
        delay = 100;
        break;
      case 'quality':
        // Quality tracked internally, not shown in chat
        delay = 0;
        break;
      case 'done': {
        const result = event.data as unknown as GenerateResult;
        handleStreamDone(result);
        delay = 0;
        break;
      }
      case 'error':
        handleStreamError(event.message);
        delay = 0;
        break;
    }
    setTimeout(processNext, delay);
  }

  function onStreamEvent(event: ProgressEvent) {
    eventQueueRef.current.push(event);
    if (!processingRef.current) {
      processingRef.current = true;
      processNext();
    }
  }

  function handleStreamDone(result: GenerateResult) {
    setGenerating(false);
    setGeneratedApp(result);
    setLiveCode(result.generated_code ?? null);
    setRightPanelMode('preview');

    if (!result.generated_code) {
      addMessage('ai', 'Generation completed but no code was produced. This can happen due to a timeout or API issue. Please try again.', 'error');
      return;
    }

    const elapsed = genStartTime ? Math.round((Date.now() - genStartTime) / 1000) : null;
    const featureCount = planRef.current?.features?.length ?? 0;
    const tabCount = planRef.current?.tabs?.length ?? 0;
    const summary = `${result.name} is ready! ` +
      (featureCount > 0 ? `Built with ${featureCount} features across ${tabCount} pages. ` : '') +
      (elapsed ? `Generated in ${elapsed}s. ` : '') +
      'You can refine it using Build, Visual, or Discuss modes below.';
    addMessage('ai', summary);

    const features = planRef.current?.features ?? [];
    setSuggestions(
      features.slice(0, 3).map((f) => `Enhance the ${f.toLowerCase()}`)
    );
  }

  function handleStreamError(msg: string) {
    setGenerating(false);
    addMessage('ai', msg, 'error');
  }

  // ── Handlers ──
  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;

    setPrompt('');
    addMessage('user', trimmed);
    setGenerating(true);
    setGeneratedApp(null);
    setLiveCode(null);
    setFullApp(null);

    setStatusMessage('Analyzing your idea...');
    setSuggestions([]);
    setCurrentTipIndex(0);
    setGenStartTime(Date.now());
    planRef.current = null;
    eventQueueRef.current = [];
    processingRef.current = false;

    try {
      const { promise, abort } = generateStream(trimmed, selectedModel, onStreamEvent);
      abortRef.current = abort;
      await promise;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Generation failed. Please try again.';
      handleStreamError(msg);
    } finally {
      abortRef.current = null;
    }
  }

  async function handleRefine(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || refining || !generatedApp) return;

    setPrompt('');
    addMessage('user', trimmed);
    setRefining(true);

    try {
      const result = await api.refineApp(generatedApp.id, trimmed, workbenchMode);
      if (result.mode === 'discuss') {
        setChatHistory((prev) => [
          ...prev,
          { id: newId(), role: 'ai', content: result.advisory ?? 'No advisory output.', type: 'message', timestamp: Date.now() },
        ]);
      } else {
        setLiveCode(result.updated_code ?? null);
        setRightPanelMode('preview');
        setPreviewRefreshTick((v) => v + 1);
        setChatHistory((prev) => [
          ...prev,
          {
            id: newId(),
            role: 'ai',
            content: workbenchMode === 'visual_edit' ? 'Visual polish applied.' : 'Changes applied.',
            type: 'message',
            timestamp: Date.now(),
          },
        ]);
      }
      await refreshAppData(generatedApp.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Refinement failed.';
      setChatHistory((prev) => [...prev, { id: newId(), role: 'ai', content: msg, type: 'error', timestamp: Date.now() }]);
    } finally {
      setRefining(false);
    }
  }

  function handleShare() {
    if (!generatedApp) return;
    const url = `${window.location.origin}/share/${generatedApp.short_id}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  function renderDashboardSection() {
    if (!fullApp) return null;
    switch (activeSection) {
      case 'overview':
        return <OverviewSection app={fullApp} onShare={handleShare} shareCopied={shareCopied} />;
      case 'code':
        return <CodeSection code={fullApp.generated_code} appName={fullApp.name} />;
      case 'analytics':
        return <AnalyticsSection app={fullApp} />;
      case 'settings':
        return <SettingsSection app={fullApp} />;
      default: {
        const info = PLACEHOLDER_INFO[activeSection];
        if (info) return <PlaceholderSection title={info.title} description={info.description} iconName={info.icon} />;
        return null;
      }
    }
  }

  const hasApp = !!generatedApp;
  const isWorking = generating || refining;
  const showSplit = hasApp || generating;

  return (
    <div className="gen-page">
      {/* ── Top Bar ── */}
      <div className="gen-topbar">
        <div className="gen-topbar-left">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <StartBoxLogo size="sm" />
          </Link>
          {hasApp && (
            <>
              <span className="dash-topbar-divider" />
              <span className="dash-topbar-appname">{generatedApp.name}</span>
            </>
          )}
        </div>

        <div className="gen-topbar-center">
          {hasApp && (
            <div className="dash-mode-toggle">
              <button
                className={`dash-mode-btn${rightPanelMode === 'preview' ? ' dash-mode-btn--active' : ''}`}
                onClick={() => setRightPanelMode('preview')}
              >
                Preview
              </button>
              <button
                className={`dash-mode-btn${rightPanelMode === 'dashboard' ? ' dash-mode-btn--active' : ''}`}
                onClick={() => setRightPanelMode('dashboard')}
              >
                Dashboard
              </button>
            </div>
          )}
        </div>

        <div className="gen-topbar-right">
          {hasApp && (
            <button className="dash-topbar-btn" onClick={handleShare}>
              {shareCopied ? 'Copied!' : 'Share'}
            </button>
          )}
          <Link to="/gallery" className="dash-topbar-btn" style={{ textDecoration: 'none' }}>Apps</Link>
        </div>
      </div>

      {/* ── Body ── */}
      <div className={`gen-body${showSplit ? ' gen-body--split' : ''}`}>
        {/* Floating icons background (only pre-generation) */}
        {!showSplit && <FloatingIcons />}

        {/* ── Left Panel ── */}
        <div className={`gen-left${showSplit ? ' gen-left--sidebar' : ' gen-left--centered'}`}>
          {/* Before generation: hero */}
          {!hasApp && !generating && (
            <div className="gen-hero">
              <div className="gen-hero-logo">
                <StartBoxLogo size="lg" showText={false} />
              </div>
              <h1 className="gen-hero-title">What will you build?</h1>
              <p className="gen-hero-sub">
                Describe your idea and StartBox will generate a fully functional app in seconds.
              </p>
            </div>
          )}

          {/* Chat area — shown during generation AND after generation */}
          {showSplit && (
            <div className="gen-chat">
              {chatHistory.map((msg) => {
                switch (msg.type) {
                  case 'narrative':
                    return (
                      <div key={msg.id} className="gen-msg gen-msg--ai">
                        <div className="gen-msg-avatar gen-msg-avatar--ai">S</div>
                        <div className="gen-msg-body">{msg.content}</div>
                      </div>
                    );
                  case 'plan': {
                    // Render plan as flowing text with markdown-like formatting
                    const lines = msg.content.split('\n');
                    return (
                      <div key={msg.id} className="gen-msg gen-msg--ai gen-msg--plan-text">
                        <div className="gen-msg-avatar gen-msg-avatar--ai">S</div>
                        <div className="gen-msg-body">
                          {lines.map((line, i) => {
                            if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
                            if (line.startsWith('**') && line.endsWith('**'))
                              return <div key={i} className="gen-plan-name">{line.slice(2, -2)}</div>;
                            if (/^\d+\.\s/.test(line)) {
                              const [num, ...rest] = line.split('. ');
                              const text = rest.join('. ');
                              const [name, desc] = text.includes(' — ') ? text.split(' — ') : [text, ''];
                              return (
                                <div key={i} className="gen-plan-line">
                                  <span className="gen-plan-num">{num}.</span>
                                  <span><strong>{name}</strong>{desc ? ` — ${desc}` : ''}</span>
                                </div>
                              );
                            }
                            if (line.startsWith('Key Features:'))
                              return <div key={i} className="gen-plan-section">{line}</div>;
                            if (line.startsWith('Pages:'))
                              return <div key={i} className="gen-plan-pages">{line}</div>;
                            return <div key={i} className="gen-plan-meta">{line}</div>;
                          })}
                        </div>
                      </div>
                    );
                  }
                  case 'building':
                    return (
                      <div key={msg.id} className="gen-msg gen-msg--ai">
                        <div className="gen-msg-avatar gen-msg-avatar--ai">S</div>
                        <span>{msg.content}</span>
                      </div>
                    );
                  case 'writing':
                    return (
                      <div key={msg.id} className={`gen-msg gen-msg--writing${msg.data?.milestone ? ' gen-msg--milestone' : ''}`}>
                        <span className="writing-indicator" />
                        {msg.data?.milestone ? (
                          <span className="writing-milestone-text">{msg.content}</span>
                        ) : (
                          <span className="writing-file-text">
                            <span className="writing-action">Wrote</span>
                            <span className="writing-path">{msg.content}</span>
                          </span>
                        )}
                      </div>
                    );
                  case 'created':
                    return (
                      <div key={msg.id} className="gen-msg gen-msg--created">
                        <span className="created-check">&#10003;</span>
                        <span>Components created</span>
                      </div>
                    );
                  case 'quality':
                    return null;
                  default:
                    return (
                      <div
                        key={msg.id}
                        className={`gen-msg gen-msg--${msg.role}${msg.type === 'error' ? ' gen-msg--error' : ''}`}
                      >
                        <div className={`gen-msg-avatar gen-msg-avatar--${msg.role}`}>
                          {msg.role === 'ai' ? 'S' : 'U'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span>{msg.content}</span>
                        </div>
                      </div>
                    );
                }
              })}

              {/* Transient status spinner — only during generation, disappears when done */}
              {generating && statusMessage && (
                <div className="gen-msg gen-msg--ai gen-msg--progress">
                  <div className="gen-msg-avatar gen-msg-avatar--ai">S</div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="gen-msg-spinner" />
                    <span>{statusMessage}</span>
                  </div>
                </div>
              )}

              {/* Suggestion chips (after generation) */}
              {hasApp && suggestions.length > 0 && (
                <div className="gen-suggestions">
                  <div className="gen-suggestions-label">Suggestions</div>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      className="gen-suggestion-chip"
                      onClick={() => setPrompt(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          )}

          {/* Prompt input */}
          <div className={`gen-input-area${showSplit ? ' gen-input-area--bottom' : ''}`}>
            {hasApp && (
              <div className="gen-model-row">
                <button
                  className={`gen-model-pill${workbenchMode === 'build' ? ' active' : ''}`}
                  onClick={() => setWorkbenchMode('build')}
                  disabled={isWorking}
                >
                  Build
                </button>
                <button
                  className={`gen-model-pill${workbenchMode === 'visual_edit' ? ' active' : ''}`}
                  onClick={() => setWorkbenchMode('visual_edit')}
                  disabled={isWorking}
                >
                  Visual
                </button>
                <button
                  className={`gen-model-pill${workbenchMode === 'discuss' ? ' active' : ''}`}
                  onClick={() => setWorkbenchMode('discuss')}
                  disabled={isWorking}
                >
                  Discuss
                </button>
              </div>
            )}

            <form onSubmit={hasApp ? handleRefine : handleGenerate} className="gen-input-form">
              <textarea
                className="gen-input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  hasApp
                    ? workbenchMode === 'visual_edit'
                      ? 'Polish visual style: spacing, typography, shadows, color system...'
                      : workbenchMode === 'discuss'
                        ? 'Ask for strategy feedback before code changes...'
                        : 'Request structural changes: features, tabs, flows...'
                    : 'Describe the app you want to build...'
                }
                rows={hasApp ? 3 : 4}
                disabled={isWorking}
              />
              <div className="gen-input-footer">
                {!hasApp && !generating ? (
                  <div className="gen-model-selector" ref={modelDropdownRef}>
                    <button
                      type="button"
                      className="gen-model-trigger"
                      onClick={() => setModelDropdownOpen((v) => !v)}
                    >
                      <ClaudeLogo size={14} />
                      <span>{MODEL_OPTIONS.find((m) => m.id === selectedModel)?.shortName}</span>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
                        <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {modelDropdownOpen && (
                      <div className="gen-model-dropdown">
                        <div className="gen-model-dropdown-label">Model</div>
                        {MODEL_OPTIONS.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            className={`gen-model-option${selectedModel === model.id ? ' gen-model-option--active' : ''}`}
                            onClick={() => { setSelectedModel(model.id); setModelDropdownOpen(false); }}
                          >
                            <ClaudeLogo size={16} />
                            <div className="gen-model-option-info">
                              <span className="gen-model-option-name">{model.name}</span>
                              <span className="gen-model-option-desc">{model.desc}</span>
                            </div>
                            {selectedModel === model.id && (
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="gen-model-check">
                                <path d="M3.5 8.5L6.5 11.5L12.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="gen-input-hint">Quality-first pipeline</span>
                )}
                <button type="submit" className="gen-input-submit" disabled={isWorking || !prompt.trim()}>
                  {isWorking ? 'Working...' : hasApp ? (workbenchMode === 'discuss' ? 'Discuss' : 'Apply') : 'Generate'}
                </button>
              </div>
            </form>

            {/* Starter prompt chips (before generation only) */}
            {!hasApp && !generating && (
              <div className="gen-starters">
                {STARTER_PROMPTS.map((sp) => (
                  <button
                    key={sp}
                    className="gen-starter-chip"
                    onClick={() => setPrompt(sp)}
                  >
                    {sp}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Panel ── */}
        {showSplit && (
          <div className="gen-right">
            {/* Loading screen during generation */}
            {generating && !hasApp && (
              <div className="gen-loading-screen">
                <div className="gen-loading-content">
                  <div className="gen-loading-logo">
                    <StartBoxLogo size="lg" showText={false} />
                    <div className="gen-loading-logo-ring" />
                  </div>
                  <h2 className="gen-loading-title">Building your idea...</h2>
                  <p className="gen-loading-status">{statusMessage}</p>
                  <div className="gen-loading-progress">
                    <div className="gen-loading-progress-fill" />
                  </div>
                  <div className="gen-loading-tip" key={currentTipIndex}>
                    <span className="gen-loading-tip-label">Did you know?</span>
                    <span className="gen-loading-tip-text">{DID_YOU_KNOW_TIPS[currentTipIndex]}</span>
                  </div>
                </div>
              </div>
            )}

            {/* App preview */}
            {hasApp && rightPanelMode === 'preview' && liveCode && (
              <div className="gen-preview-stage">
                <div className="gen-preview-glass">
                  <AppPreview
                    key={`${generatedApp.id}:${previewRefreshTick}`}
                    code={liveCode}
                    appId={generatedApp.id}
                    height="100%"
                  />
                </div>
              </div>
            )}
            {hasApp && rightPanelMode === 'preview' && !liveCode && (
              <div className="gen-right-empty">
                <h3>{generatedApp.name}</h3>
                <p>{generatedApp.description}</p>
              </div>
            )}
            {hasApp && rightPanelMode === 'dashboard' && (
              <div className="gen-dashboard-wrap">
                <DashboardSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
                <div className="gen-dashboard-content">
                  {fullApp ? renderDashboardSection() : (
                    <div className="gen-right-empty">
                      <span className="spinner spinner-lg" />
                      <p>Loading dashboard...</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
