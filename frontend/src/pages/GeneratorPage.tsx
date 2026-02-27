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
type ChatType = 'message' | 'progress' | 'error';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  type: ChatType;
  timestamp: number;
}

interface PlanData {
  app_name: string;
  domain: string;
  design: string;
  features: string[];
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
  const [selectedModel] = useState<'sonnet' | 'opus'>(restored.current?.selectedModel ?? 'sonnet');
  const [shareCopied, setShareCopied] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<'preview' | 'dashboard'>('preview');
  const [activeSection, setActiveSection] = useState('overview');
  const [fullApp, setFullApp] = useState<AppRecord | null>(null);
  const [workbenchMode, setWorkbenchMode] = useState<'build' | 'visual_edit' | 'discuss'>(restored.current?.workbenchMode ?? 'build');
  const [previewRefreshTick, setPreviewRefreshTick] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

  // ── Streaming state ──
  const [statusMessage, setStatusMessage] = useState('');
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [writtenComponents, setWrittenComponents] = useState<string[]>([]);
  const [createdAll, setCreatedAll] = useState(false);
  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [genStartTime, setGenStartTime] = useState<number | null>(null);

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

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, writtenComponents, createdAll, planData, qualityScore, suggestions]);

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

  // ── Event queue processor ──
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
      case 'plan':
        setPlanData(event.data as unknown as PlanData);
        delay = 300;
        break;
      case 'writing':
        setWrittenComponents((prev) => {
          const name = (event.data?.component as string) ?? event.message;
          if (prev.includes(name)) return prev;
          return [...prev, name];
        });
        delay = 180;
        break;
      case 'created':
        setCreatedAll(true);
        delay = 100;
        break;
      case 'quality':
        setQualityScore((event.data as { score?: number })?.score ?? null);
        delay = 200;
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

    const elapsed = genStartTime ? Math.round((Date.now() - genStartTime) / 1000) : null;
    const scoreText = result.quality_score ? ` Quality score: ${result.quality_score}/100.` : '';
    const timeText = elapsed ? ` Built in ${elapsed}s.` : '';
    addMessage('ai', `${result.name} is ready!${scoreText}${timeText}`);

    const features = planData?.features ?? [];
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
    setPlanData(null);
    setWrittenComponents([]);
    setCreatedAll(false);
    setQualityScore(null);
    setSuggestions([]);
    setCurrentTipIndex(0);
    setGenStartTime(Date.now());
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
              {chatHistory.map((msg) => (
                <div
                  key={msg.id}
                  className={`gen-msg gen-msg--${msg.role}${msg.type === 'error' ? ' gen-msg--error' : ''}${msg.type === 'progress' ? ' gen-msg--progress' : ''}`}
                >
                  <div className={`gen-msg-avatar gen-msg-avatar--${msg.role}`}>
                    {msg.role === 'ai' ? 'S' : 'U'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {msg.type === 'progress' && <span className="gen-msg-spinner" />}
                    <span>{msg.content}</span>
                  </div>
                </div>
              ))}

              {/* ── Streaming progress (only during generation) ── */}
              {generating && (
                <>
                  {statusMessage && !planData && (
                    <div className="gen-msg gen-msg--ai gen-msg--progress">
                      <div className="gen-msg-avatar gen-msg-avatar--ai">S</div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="gen-msg-spinner" />
                        <span>{statusMessage}</span>
                      </div>
                    </div>
                  )}

                  {planData && (
                    <div className="gen-msg--plan">
                      <div className="gen-plan-title">{planData.app_name}</div>
                      <div className="gen-plan-domain">{planData.domain}</div>
                      {planData.features.length > 0 && (
                        <div className="gen-plan-features">
                          {planData.features.map((f) => (
                            <span key={f} className="gen-plan-chip">{f}</span>
                          ))}
                        </div>
                      )}
                      {planData.tabs.length > 0 && (
                        <div className="gen-plan-tabs">
                          {planData.tabs.map((t) => (
                            <span key={t} className="gen-plan-tab">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {writtenComponents.map((name, i) => (
                    <div
                      key={`w-${name}`}
                      className="gen-msg gen-msg--writing"
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      <span className="writing-dot" />
                      <span>Wrote <strong>{name}</strong></span>
                    </div>
                  ))}

                  {createdAll && (
                    <div className="gen-msg gen-msg--created">
                      <span className="created-check">&#10003;</span>
                      <span>Created</span>
                    </div>
                  )}

                  {qualityScore !== null && (
                    <div className="gen-msg gen-msg--quality">
                      <span className="gen-quality-score">{qualityScore}</span>
                      <span className="gen-quality-label">/100 quality score</span>
                    </div>
                  )}
                </>
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
                <span className="gen-input-hint">Quality-first pipeline</span>
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
