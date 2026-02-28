import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Monitor, Tablet, Smartphone, Paintbrush } from 'lucide-react';
import { api, generateStream, clarifyPrompt, type AppRecord, type GenerateResult, type ProgressEvent, type ClarifyQuestion } from '../lib/api';
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
  'StartBox apps ship with production-ready code and modern SaaS styling.',
  'Every app includes smart features and polished interactions out of the box.',
  'Apps are built with responsive layouts that work on any screen size.',
  'Each build goes through a 7-dimension quality scoring pipeline.',
  'You can refine your app with Build, Visual, and Discuss modes.',
  'Apps include pre-populated demo data so you can preview instantly.',
];

const STARTER_PROMPTS = [
  'Build a project management tool',
  'Create a personal finance tracker',
  'Make a recipe organizer app',
  'Build a customer CRM dashboard',
];

const MODEL_OPTIONS: Array<{ id: 'sonnet' | 'opus'; name: string; shortName: string; desc: string }> = [
  { id: 'sonnet', name: 'Standard Engine', shortName: 'Standard', desc: 'Fast & reliable' },
  { id: 'opus', name: 'Pro Engine', shortName: 'Pro', desc: 'Maximum fidelity' },
];

function EngineLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="12" height="12" rx="3" stroke="#666" strokeWidth="1.4" />
      <path d="M5.5 8h5M8 5.5v5" stroke="#666" strokeWidth="1.4" strokeLinecap="round" />
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
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── Design sidebar state ──
  const [designSidebarOpen, setDesignSidebarOpen] = useState(false);
  const [designTheme, setDesignTheme] = useState<'dark' | 'light'>('dark');
  const [designColor, setDesignColor] = useState('#6366f1');
  const [designFont, setDesignFont] = useState<'inter' | 'system' | 'mono'>('inter');
  const [designDensity, setDesignDensity] = useState<'compact' | 'default' | 'spacious'>('default');
  const [applyingDesign, setApplyingDesign] = useState(false);

  // ── Clarification state ──
  const [clarifying, setClarifying] = useState(false);
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<number, string>>({});
  const [originalPrompt, setOriginalPrompt] = useState('');

  // ── Streaming state (transient only — events go into chatHistory) ──
  const [statusMessage, setStatusMessage] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [genStartTime, setGenStartTime] = useState<number | null>(null);
  const [buildSteps, setBuildSteps] = useState<string[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
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

  // Elapsed timer during generation
  useEffect(() => {
    if (!generating) { setElapsedSec(0); return; }
    const interval = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [generating]);

  // Track build steps from status messages
  useEffect(() => {
    if (!statusMessage || !generating) return;
    setBuildSteps((prev) => {
      if (prev.includes(statusMessage)) return prev;
      return [...prev, statusMessage];
    });
  }, [statusMessage, generating]);

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
        // Brief project summary — no AI reasoning exposed
        const featureCount = (plan.feature_details ?? plan.features ?? []).length;
        const pageCount = (plan.tabs ?? []).length;
        const summaryText = `**${plan.app_name}** — ${featureCount} features across ${pageCount} pages`;
        setChatHistory((prev) => [
          ...prev,
          { id: newId(), role: 'ai', content: summaryText, type: 'plan', timestamp: Date.now(), data: event.data },
        ]);
        delay = 200;
        break;
      }
      case 'writing': {
        // Only show milestone build-steps, skip individual file writes
        const isMilestone = !!(event.data?.milestone);
        if (isMilestone) {
          setChatHistory((prev) => {
            if (prev.some((m) => m.type === 'writing' && m.content === event.message)) return prev;
            return [...prev, { id: newId(), role: 'ai', content: event.message, type: 'writing', timestamp: Date.now(), data: event.data }];
          });
          delay = 200;
        } else {
          delay = 0; // silently skip file-level writes
        }
        break;
      }
      case 'created':
        // Skip "Components created" — redundant with milestones
        delay = 0;
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
      addMessage('ai', 'Build completed but no output was produced. This can happen due to a timeout. Please try again.', 'error');
      return;
    }

    const elapsed = genStartTime ? Math.round((Date.now() - genStartTime) / 1000) : null;
    const featureCount = planRef.current?.features?.length ?? 0;
    const tabCount = planRef.current?.tabs?.length ?? 0;
    const summary = `${result.name} is ready! ` +
      (featureCount > 0 ? `${featureCount} features across ${tabCount} pages. ` : '') +
      (elapsed ? `Built in ${elapsed}s. ` : '') +
      'Refine it using Build, Visual, or Discuss modes below.';
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
  async function startBuild(buildPrompt: string) {
    setGenerating(true);
    setGeneratedApp(null);
    setLiveCode(null);
    setFullApp(null);

    setStatusMessage('Scaffolding project...');
    setSuggestions([]);
    setBuildSteps([]);
    setElapsedSec(0);
    setCurrentTipIndex(0);
    setGenStartTime(Date.now());
    planRef.current = null;
    eventQueueRef.current = [];
    processingRef.current = false;

    try {
      const { promise, abort } = generateStream(buildPrompt, selectedModel, onStreamEvent);
      abortRef.current = abort;
      await promise;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Build failed. Please try again.';
      handleStreamError(msg);
    } finally {
      abortRef.current = null;
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || generating || clarifying) return;

    setPrompt('');
    addMessage('user', trimmed);

    // Check if the prompt needs clarification
    setClarifying(true);
    try {
      const result = await clarifyPrompt(trimmed);
      if (!result.clear && result.questions && result.questions.length > 0) {
        // Prompt is vague — show clarification questions
        setOriginalPrompt(trimmed);
        setClarifyQuestions(result.questions);
        setClarifyAnswers({});
        setClarifying(false);
        return;
      }
    } catch {
      // Clarification failed — just proceed with the build
    }
    setClarifying(false);

    // Prompt is clear enough — start building
    await startBuild(trimmed);
  }

  function handleClarifySelect(qIndex: number, option: string) {
    setClarifyAnswers((prev) => ({ ...prev, [qIndex]: option }));
  }

  async function handleClarifySubmit() {
    // Build a refined prompt from original + answers
    const answerLines = clarifyQuestions
      .map((q, i) => clarifyAnswers[i] ? `${q.question} ${clarifyAnswers[i]}` : '')
      .filter(Boolean)
      .join('. ');
    const refined = `${originalPrompt}. ${answerLines}`;

    // Add a brief message showing what was refined
    addMessage('ai', `Got it — building a ${answerLines.toLowerCase()}.`, 'narrative');

    // Reset clarification state
    setClarifyQuestions([]);
    setClarifyAnswers({});
    setOriginalPrompt('');

    // Start the build
    await startBuild(refined);
  }

  function handleClarifySkip() {
    const saved = originalPrompt;
    setClarifyQuestions([]);
    setClarifyAnswers({});
    setOriginalPrompt('');
    startBuild(saved);
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

  function handleNewApp() {
    if (abortRef.current) { abortRef.current(); abortRef.current = null; }
    setGenerating(false);
    setRefining(false);
    setClarifying(false);
    setClarifyQuestions([]);
    setClarifyAnswers({});
    setOriginalPrompt('');
    setGeneratedApp(null);
    setLiveCode(null);
    setFullApp(null);
    setChatHistory([]);
    setPrompt('');
    setStatusMessage('');
    setSuggestions([]);
    setRightPanelMode('preview');
    setPreviewDevice('desktop');
    setDesignSidebarOpen(false);
    setDesignTheme('dark');
    setDesignColor('#6366f1');
    setDesignFont('inter');
    setDesignDensity('default');
    planRef.current = null;
    eventQueueRef.current = [];
    processingRef.current = false;
    try { sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ }
  }

  // ── Instant preview injection ──
  const injectDesignVars = useCallback(() => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      const root = doc.documentElement;
      root.style.setProperty('--sb-primary', designColor);
      // Compute a glow variant
      const r = parseInt(designColor.slice(1, 3), 16);
      const g = parseInt(designColor.slice(3, 5), 16);
      const b = parseInt(designColor.slice(5, 7), 16);
      root.style.setProperty('--sb-primary-glow', `rgba(${r},${g},${b},0.2)`);
      root.style.setProperty('--sb-primary-bg', `rgba(${r},${g},${b},0.12)`);
      // Theme
      if (designTheme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
      }
      // Font
      const fontMap = { inter: "'Inter', sans-serif", system: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif", mono: "'SF Mono', 'Fira Code', monospace" };
      root.style.setProperty('--sb-font', fontMap[designFont]);
      doc.body.style.fontFamily = fontMap[designFont];
      // Density
      const densityScale = { compact: '0.85', default: '1', spacious: '1.15' };
      root.style.setProperty('--sb-density', densityScale[designDensity]);
    } catch { /* cross-origin or not loaded yet */ }
  }, [designColor, designTheme, designFont, designDensity]);

  useEffect(() => {
    injectDesignVars();
  }, [injectDesignVars]);

  async function handleApplyDesign() {
    if (!generatedApp || applyingDesign) return;
    setApplyingDesign(true);
    const instruction = `Update the design: accent color ${designColor}, ${designTheme} theme, ${designFont} font family, ${designDensity} spacing density.`;
    try {
      const result = await api.refineApp(generatedApp.id, instruction, 'visual_edit');
      if (result.updated_code) {
        setLiveCode(result.updated_code);
        setPreviewRefreshTick((v) => v + 1);
        addMessage('ai', 'Design changes applied.', 'message');
      }
      await refreshAppData(generatedApp.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to apply design.';
      addMessage('ai', msg, 'error');
    } finally {
      setApplyingDesign(false);
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
  const isWorking = generating || refining || clarifying;
  const showSplit = hasApp || generating || clarifying || clarifyQuestions.length > 0;

  return (
    <div className={`gen-page${!showSplit ? ' gen-page--landing' : ''}`}>
      {/* ── Top Bar ── */}
      <div className="gen-topbar">
        <div className="gen-topbar-left">
          {showSplit ? (
            <button onClick={handleNewApp} className="gen-topbar-logo-btn" title="Back to home">
              <StartBoxLogo size="sm" />
            </button>
          ) : (
            <Link to="/" style={{ textDecoration: 'none' }}>
              <StartBoxLogo size="sm" />
            </Link>
          )}
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
            <>
              <button className="dash-topbar-btn dash-topbar-btn--new" onClick={handleNewApp}>+ New</button>
              <button className="dash-topbar-btn" onClick={handleShare}>
                {shareCopied ? 'Copied!' : 'Share'}
              </button>
            </>
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
              <h1 className="gen-hero-title">Build something amazing</h1>
              <p className="gen-hero-sub">
                Describe your idea and we'll build a production-ready app in seconds.
              </p>
              <div className="gen-trust-badge">
                <span className="gen-trust-dot" />
                Trusted by 1,000+ builders
              </div>
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
                        <div className="gen-msg-avatar gen-msg-avatar--ai"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2"/><path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></div>
                        <div className="gen-msg-body">{msg.content}</div>
                      </div>
                    );
                  case 'plan': {
                    // Brief project summary card
                    const parts = msg.content.split(' — ');
                    const appName = parts[0]?.replace(/\*\*/g, '') ?? '';
                    const details = parts[1] ?? '';
                    return (
                      <div key={msg.id} className="gen-msg gen-msg--ai gen-msg--plan-text">
                        <div className="gen-msg-avatar gen-msg-avatar--ai"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2"/><path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></div>
                        <div className="gen-msg-body">
                          <div className="gen-plan-name">{appName}</div>
                          {details && <div className="gen-plan-meta">{details}</div>}
                        </div>
                      </div>
                    );
                  }
                  case 'building':
                    return (
                      <div key={msg.id} className="gen-msg gen-msg--ai">
                        <div className="gen-msg-avatar gen-msg-avatar--ai"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2"/><path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></div>
                        <span>{msg.content}</span>
                      </div>
                    );
                  case 'writing':
                    return (
                      <div key={msg.id} className="gen-msg gen-msg--writing gen-msg--milestone">
                        <span className="writing-indicator" />
                        <span className="writing-milestone-text">{msg.content}</span>
                      </div>
                    );
                  case 'created':
                    return null;
                  case 'quality':
                    return null;
                  default:
                    return (
                      <div
                        key={msg.id}
                        className={`gen-msg gen-msg--${msg.role}${msg.type === 'error' ? ' gen-msg--error' : ''}`}
                      >
                        <div className={`gen-msg-avatar gen-msg-avatar--${msg.role}`}>
                          {msg.role === 'ai' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2"/><path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> : 'You'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span>{msg.content}</span>
                        </div>
                      </div>
                    );
                }
              })}

              {/* Clarifying spinner */}
              {clarifying && (
                <div className="gen-msg gen-msg--ai gen-msg--progress">
                  <div className="gen-msg-avatar gen-msg-avatar--ai"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2"/><path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="gen-msg-spinner" />
                    <span>Scoping your project...</span>
                  </div>
                </div>
              )}

              {/* Clarification questions */}
              {clarifyQuestions.length > 0 && (
                <div className="gen-clarify-card">
                  <div className="gen-clarify-header">Let's narrow this down</div>
                  {clarifyQuestions.map((q, qi) => (
                    <div key={qi} className="gen-clarify-question">
                      <div className="gen-clarify-label">{q.question}</div>
                      <div className="gen-clarify-options">
                        {q.options.map((opt) => (
                          <button
                            key={opt}
                            className={`gen-clarify-option${clarifyAnswers[qi] === opt ? ' gen-clarify-option--selected' : ''}`}
                            onClick={() => handleClarifySelect(qi, opt)}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="gen-clarify-actions">
                    <button
                      className="gen-clarify-build"
                      disabled={Object.keys(clarifyAnswers).length === 0}
                      onClick={handleClarifySubmit}
                    >
                      Build
                    </button>
                    <button className="gen-clarify-skip" onClick={handleClarifySkip}>
                      Skip — build as-is
                    </button>
                  </div>
                </div>
              )}

              {/* Transient status spinner — only during generation, disappears when done */}
              {generating && statusMessage && (
                <div className="gen-msg gen-msg--ai gen-msg--progress">
                  <div className="gen-msg-avatar gen-msg-avatar--ai"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2"/><path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></div>
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
                      <EngineLogo size={14} />
                      <span>{MODEL_OPTIONS.find((m) => m.id === selectedModel)?.shortName}</span>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
                        <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {modelDropdownOpen && (
                      <div className="gen-model-dropdown">
                        <div className="gen-model-dropdown-label">Engine</div>
                        {MODEL_OPTIONS.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            className={`gen-model-option${selectedModel === model.id ? ' gen-model-option--active' : ''}`}
                            onClick={() => { setSelectedModel(model.id); setModelDropdownOpen(false); }}
                          >
                            <EngineLogo size={16} />
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
                  <span className="gen-input-hint">Production-grade build</span>
                )}
                <button type="submit" className="gen-input-submit" disabled={isWorking || !prompt.trim()}>
                  {isWorking ? 'Building...' : hasApp ? (workbenchMode === 'discuss' ? 'Discuss' : 'Apply') : 'Build'}
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
            {/* Loading screen during generation — Apple Health style */}
            {generating && !hasApp && (
              <div className="gen-loading-screen">
                <div className="gen-loading-scroll">
                  {/* Header */}
                  <div className="gen-loading-header">
                    <h2 className="gen-loading-title">Build</h2>
                    <span className="gen-loading-elapsed">{Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')}</span>
                  </div>

                  {/* Activity Ring Card */}
                  <div className="gen-loading-card gen-loading-ring-card">
                    <div className="gen-loading-ring-wrap">
                      <svg className="gen-loading-ring-svg" viewBox="0 0 120 120">
                        {/* Background track */}
                        <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(99,102,241,0.1)" strokeWidth="10" />
                        {/* Progress arc */}
                        <circle
                          cx="60" cy="60" r="50" fill="none"
                          stroke="url(#ring-gradient)" strokeWidth="10"
                          strokeLinecap="round"
                          strokeDasharray="314"
                          strokeDashoffset={314 - Math.min(buildSteps.length / 8, 1) * 314}
                          transform="rotate(-90 60 60)"
                          style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
                        />
                        <defs>
                          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#6366f1" />
                            <stop offset="100%" stopColor="#a855f7" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="gen-loading-ring-inner">
                        <span className="gen-loading-ring-icon">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#6366f1"/></svg>
                        </span>
                      </div>
                    </div>
                    <div className="gen-loading-ring-info">
                      <span className="gen-loading-ring-label">Progress</span>
                      <span className="gen-loading-ring-value">{buildSteps.length}<span className="gen-loading-ring-unit"> / 8 steps</span></span>
                      <span className="gen-loading-ring-status">{statusMessage}</span>
                    </div>
                  </div>

                  {/* Build Steps Cards */}
                  <div className="gen-loading-steps-grid">
                    <div className="gen-loading-stat-card">
                      <span className="gen-loading-stat-title">Steps Done</span>
                      <span className="gen-loading-stat-value" style={{ color: '#6366f1' }}>{buildSteps.length}</span>
                    </div>
                    <div className="gen-loading-stat-card">
                      <span className="gen-loading-stat-title">Time Elapsed</span>
                      <span className="gen-loading-stat-value" style={{ color: '#a855f7' }}>{elapsedSec}s</span>
                    </div>
                  </div>

                  {/* Completed steps list */}
                  {buildSteps.length > 0 && (
                    <div className="gen-loading-card gen-loading-steps-card">
                      <div className="gen-loading-steps-title">Build Log</div>
                      {buildSteps.map((step, i) => (
                        <div key={i} className="gen-loading-step">
                          <span className="gen-loading-step-check">&#10003;</span>
                          <span className="gen-loading-step-text">{step.replace('...', '')}</span>
                        </div>
                      ))}
                      {statusMessage && !buildSteps.includes(statusMessage) && (
                        <div className="gen-loading-step gen-loading-step--active">
                          <span className="gen-loading-step-spinner" />
                          <span className="gen-loading-step-text">{statusMessage.replace('...', '')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tip card */}
                  <div className="gen-loading-card gen-loading-tip-card" key={currentTipIndex}>
                    <span className="gen-loading-tip-label">Tip</span>
                    <span className="gen-loading-tip-text">{DID_YOU_KNOW_TIPS[currentTipIndex]}</span>
                  </div>
                </div>
              </div>
            )}

            {/* App preview */}
            {hasApp && rightPanelMode === 'preview' && liveCode && (
              <div className="gen-preview-stage">
                <div className="gen-preview-main">
                  {/* Device switcher bar */}
                  <div className="gen-device-bar">
                    <button
                      className={`gen-device-btn${previewDevice === 'desktop' ? ' gen-device-btn--active' : ''}`}
                      onClick={() => setPreviewDevice('desktop')}
                      title="Desktop"
                    >
                      <Monitor size={15} strokeWidth={1.8} />
                    </button>
                    <button
                      className={`gen-device-btn${previewDevice === 'tablet' ? ' gen-device-btn--active' : ''}`}
                      onClick={() => setPreviewDevice('tablet')}
                      title="Tablet"
                    >
                      <Tablet size={15} strokeWidth={1.8} />
                    </button>
                    <button
                      className={`gen-device-btn${previewDevice === 'mobile' ? ' gen-device-btn--active' : ''}`}
                      onClick={() => setPreviewDevice('mobile')}
                      title="Mobile"
                    >
                      <Smartphone size={15} strokeWidth={1.8} />
                    </button>
                    <span className="gen-device-divider" />
                    <button
                      className={`gen-device-btn${designSidebarOpen ? ' gen-device-btn--active' : ''}`}
                      onClick={() => setDesignSidebarOpen((v) => !v)}
                      title="Design"
                    >
                      <Paintbrush size={15} strokeWidth={1.8} />
                    </button>
                  </div>
                  <div className={`gen-preview-glass gen-preview--${previewDevice}`}>
                    <AppPreview
                      ref={iframeRef}
                      key={`${generatedApp.id}:${previewRefreshTick}`}
                      code={liveCode}
                      appId={generatedApp.id}
                      height="100%"
                    />
                  </div>
                </div>

                {/* Design Sidebar */}
                {designSidebarOpen && (
                  <div className="gen-design-sidebar">
                    <div className="gen-design-header">
                      <span className="gen-design-title">Design</span>
                      <button className="gen-design-close" onClick={() => setDesignSidebarOpen(false)}>&times;</button>
                    </div>

                    {/* Theme */}
                    <div className="gen-design-section">
                      <div className="gen-design-label">Theme</div>
                      <div className="gen-design-pills">
                        <button
                          className={`gen-design-pill${designTheme === 'dark' ? ' gen-design-pill--active' : ''}`}
                          onClick={() => setDesignTheme('dark')}
                        >Dark</button>
                        <button
                          className={`gen-design-pill${designTheme === 'light' ? ' gen-design-pill--active' : ''}`}
                          onClick={() => setDesignTheme('light')}
                        >Light</button>
                      </div>
                    </div>

                    {/* Accent Color */}
                    <div className="gen-design-section">
                      <div className="gen-design-label">Accent Color</div>
                      <div className="gen-design-swatches">
                        {['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'].map((c) => (
                          <button
                            key={c}
                            className={`gen-design-swatch${designColor === c ? ' gen-design-swatch--active' : ''}`}
                            style={{ background: c }}
                            onClick={() => setDesignColor(c)}
                          />
                        ))}
                      </div>
                      <div className="gen-design-hex-row">
                        <input
                          type="text"
                          className="gen-design-hex"
                          value={designColor}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setDesignColor(v);
                          }}
                          maxLength={7}
                          spellCheck={false}
                        />
                      </div>
                    </div>

                    {/* Font */}
                    <div className="gen-design-section">
                      <div className="gen-design-label">Font</div>
                      <div className="gen-design-pills">
                        <button
                          className={`gen-design-pill${designFont === 'inter' ? ' gen-design-pill--active' : ''}`}
                          onClick={() => setDesignFont('inter')}
                        >Inter</button>
                        <button
                          className={`gen-design-pill${designFont === 'system' ? ' gen-design-pill--active' : ''}`}
                          onClick={() => setDesignFont('system')}
                        >System</button>
                        <button
                          className={`gen-design-pill${designFont === 'mono' ? ' gen-design-pill--active' : ''}`}
                          onClick={() => setDesignFont('mono')}
                        >Mono</button>
                      </div>
                    </div>

                    {/* Density */}
                    <div className="gen-design-section">
                      <div className="gen-design-label">Density</div>
                      <div className="gen-design-pills">
                        <button
                          className={`gen-design-pill${designDensity === 'compact' ? ' gen-design-pill--active' : ''}`}
                          onClick={() => setDesignDensity('compact')}
                        >Compact</button>
                        <button
                          className={`gen-design-pill${designDensity === 'default' ? ' gen-design-pill--active' : ''}`}
                          onClick={() => setDesignDensity('default')}
                        >Default</button>
                        <button
                          className={`gen-design-pill${designDensity === 'spacious' ? ' gen-design-pill--active' : ''}`}
                          onClick={() => setDesignDensity('spacious')}
                        >Spacious</button>
                      </div>
                    </div>

                    {/* Apply button */}
                    <button
                      className="gen-design-apply"
                      onClick={handleApplyDesign}
                      disabled={applyingDesign}
                    >
                      {applyingDesign ? 'Applying...' : 'Apply Design'}
                    </button>
                  </div>
                )}
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
