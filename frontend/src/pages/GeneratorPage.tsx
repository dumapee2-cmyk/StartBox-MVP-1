import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type GenerateResult } from '../lib/api';
import { AppPreview } from '../components/AppPreview';
import { useRecentApps } from '../hooks/useRecentApps';

type ChatRole = 'user' | 'ai';
type ChatType = 'message' | 'progress' | 'error';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  type: ChatType;
}

const EXAMPLES = [
  {
    icon: '🥗',
    text: 'Cal AI food scanner',
    desc: 'Analyze meals, track macros with score cards',
    prompt: 'Build a food and nutrition scanner app like Cal AI. Users describe or photograph their meal and get instant macro breakdown with a nutrition score card.',
  },
  {
    icon: '📄',
    text: 'AI Resume & ATS Checker',
    desc: 'Score resumes, flag keyword gaps',
    prompt: 'Build an AI resume checker that scores resumes against job descriptions, grades ATS compatibility, and highlights keyword gaps with actionable suggestions.',
  },
  {
    icon: '✉️',
    text: 'Professional Email Writer',
    desc: 'Generate polished emails from bullet points',
    prompt: 'Build a professional email writer app. User provides bullet points and tone, app generates a polished email with subject line suggestions.',
  },
  {
    icon: '📊',
    text: 'Business Idea Validator',
    desc: 'Score ideas with market viability analysis',
    prompt: 'Build a startup idea validator. Users describe their business idea and target market. AI scores viability 1-100 with market size, competition, and monetization breakdown.',
  },
];

const PIPELINE_STEPS = [
  'Understanding your idea...',
  'Designing app architecture...',
  'Generating React code...',
  'Finalizing your app...',
];

let msgCounter = 0;
function newId() { return String(++msgCounter); }

export function GeneratorPage() {
  const [prompt, setPrompt] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [generatedApp, setGeneratedApp] = useState<GenerateResult | null>(null);
  const [liveCode, setLiveCode] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<'sonnet' | 'opus'>('sonnet');
  const [pipelineStep, setPipelineStep] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);
  const pipelineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const { apps: recentApps } = useRecentApps();

  useEffect(() => {
    return () => { if (pipelineTimer.current) clearTimeout(pipelineTimer.current); };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  function advancePipeline(step: number) {
    if (step < PIPELINE_STEPS.length) {
      setPipelineStep(step);
      pipelineTimer.current = setTimeout(() => advancePipeline(step + 1), 2800);
    }
  }

  function addMessage(role: ChatRole, content: string, type: ChatType = 'message') {
    setChatHistory((prev) => [...prev, { id: newId(), role, content, type }]);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;

    setPrompt('');
    addMessage('user', trimmed);
    setGenerating(true);
    setGeneratedApp(null);
    setLiveCode(null);
    setPipelineStep(0);
    advancePipeline(0);

    addMessage('ai', PIPELINE_STEPS[0], 'progress');

    try {
      const result = await api.generate(trimmed, selectedModel);
      if (pipelineTimer.current) clearTimeout(pipelineTimer.current);
      setPipelineStep(PIPELINE_STEPS.length);

      setGeneratedApp(result);
      setLiveCode(result.generated_code ?? null);

      // Replace progress message with success
      setChatHistory((prev) => [
        ...prev.filter((m) => m.type !== 'progress'),
        {
          id: newId(),
          role: 'ai',
          content: `✓ Built **${result.name}** — ${result.tagline || result.description}`,
          type: 'message',
        },
      ]);
    } catch (err) {
      if (pipelineTimer.current) clearTimeout(pipelineTimer.current);
      const msg = err instanceof Error ? err.message : 'Generation failed. Please try again.';
      setChatHistory((prev) => [
        ...prev.filter((m) => m.type !== 'progress'),
        { id: newId(), role: 'ai', content: msg, type: 'error' },
      ]);
    } finally {
      setGenerating(false);
    }
  }

  async function handleRefine(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || refining || !generatedApp) return;

    setPrompt('');
    addMessage('user', trimmed);
    setRefining(true);
    addMessage('ai', 'Refining your app...', 'progress');

    try {
      const result = await api.refineApp(generatedApp.id, trimmed);
      setLiveCode(result.updated_code);
      setChatHistory((prev) => [
        ...prev.filter((m) => m.type !== 'progress'),
        { id: newId(), role: 'ai', content: '✓ App updated. Changes are live in the preview.', type: 'message' },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Refinement failed.';
      setChatHistory((prev) => [
        ...prev.filter((m) => m.type !== 'progress'),
        { id: newId(), role: 'ai', content: msg, type: 'error' },
      ]);
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

  function handleOpenApp() {
    if (generatedApp) navigate(`/app/${generatedApp.id}`);
  }

  function handleDownload() {
    if (!liveCode) return;
    const blob = new Blob([liveCode], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedApp?.name?.replace(/\s+/g, '-') ?? 'app'}.jsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isRefinement = !!generatedApp;
  const isWorking = generating || refining;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (isRefinement) {
        handleRefine(e as unknown as React.FormEvent);
      } else {
        handleGenerate(e as unknown as React.FormEvent);
      }
    }
  }

  return (
    <div className="gen-layout">
      {/* ═══ LEFT SIDEBAR ═══ */}
      <aside className="gen-sidebar">
        <div className="gen-sidebar-header">
          <div className="gen-logo-mark">⚡</div>
          <span className="gen-logo-text">StartBox</span>
          <span className="gen-logo-badge">MVP</span>
        </div>

        <div className="gen-sidebar-body">
          {/* Model selector */}
          <div className="gen-model-selector">
            <button
              className={`gen-model-btn${selectedModel === 'sonnet' ? ' active' : ''}`}
              onClick={() => setSelectedModel('sonnet')}
              disabled={isWorking}
            >
              ⚡ Sonnet
            </button>
            <button
              className={`gen-model-btn${selectedModel === 'opus' ? ' active' : ''}`}
              onClick={() => setSelectedModel('opus')}
              disabled={isWorking}
            >
              🔥 Opus
            </button>
          </div>

          {/* Chat history */}
          {chatHistory.length > 0 && (
            <div className="gen-chat-area">
              {chatHistory.map((msg) => (
                <div
                  key={msg.id}
                  className={`gen-chat-msg gen-chat-msg--${msg.role}${msg.type === 'error' ? ' gen-chat-msg--error' : ''}${msg.type === 'progress' ? ' gen-chat-msg--progress' : ''}`}
                >
                  {msg.type === 'progress' && (
                    <span className="gen-chat-spinner" />
                  )}
                  <span>{msg.content}</span>
                </div>
              ))}
              {generating && (
                <div className="gen-pipeline-mini">
                  {PIPELINE_STEPS.map((step, i) => (
                    <div
                      key={step}
                      className={`pipeline-mini-step${i < pipelineStep ? ' done' : i === pipelineStep ? ' active' : ''}`}
                    >
                      <span className="pipeline-mini-dot" />
                      {i < pipelineStep ? '✓ ' : ''}{step}
                    </div>
                  ))}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Input area */}
          <div className="gen-prompt-area">
            <form onSubmit={isRefinement ? handleRefine : handleGenerate}>
              <textarea
                ref={textareaRef}
                className="gen-textarea"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isRefinement
                    ? 'Refine your app... e.g. "Change the color to purple" or "Add a history tab"'
                    : 'Describe your app idea... e.g. A food scanner that scores nutrition like Cal AI'
                }
                rows={4}
                disabled={isWorking}
              />
              <div className="gen-prompt-footer">
                <span className="gen-prompt-hint">⌘↵ to send</span>
                <button
                  type="submit"
                  className="gen-submit-btn"
                  disabled={isWorking || !prompt.trim()}
                >
                  {isWorking ? (
                    <>
                      <span className="spinner spinner-sm" />
                      {refining ? 'Refining...' : 'Generating...'}
                    </>
                  ) : isRefinement ? (
                    'Refine ✦'
                  ) : (
                    'Generate App ✦'
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Example prompts (only before first generation) */}
          {chatHistory.length === 0 && (
            <div className="gen-examples">
              <div className="gen-examples-label">Try these</div>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.text}
                  className="gen-example-chip"
                  onClick={() => setPrompt(ex.prompt)}
                  disabled={isWorking}
                >
                  <span className="gen-example-icon">{ex.icon}</span>
                  <span className="gen-example-content">
                    <span className="gen-example-text">{ex.text}</span>
                    <span className="gen-example-desc">{ex.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Recent apps */}
          {recentApps.length > 0 && (
            <div className="gen-recent">
              <div className="gen-recent-label">
                Recent Apps
                <a href="/gallery" className="gen-recent-see-all">See all →</a>
              </div>
              <div className="gen-recent-list">
                {recentApps.slice(0, 4).map((app) => (
                  <a
                    key={app.id}
                    href={`/app/${app.id}`}
                    className="gen-recent-item"
                    style={app.theme_color ? { borderLeftColor: app.theme_color } : undefined}
                  >
                    <span className="gen-recent-name">{app.name}</span>
                    {app.run_count > 0 && (
                      <span className="gen-recent-runs">{app.run_count}</span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ═══ RIGHT PREVIEW PANEL ═══ */}
      <main className="gen-preview">
        {!generatedApp && !generating && (
          <div className="gen-preview-empty">
            <div className="gen-preview-empty-icon">📱</div>
            <h3>Your app will appear here</h3>
            <p>Enter a prompt and click Generate to instantly preview a fully interactive AI app.</p>
            <div className="gen-preview-features">
              <div className="gen-preview-feature">⚡ Real React code</div>
              <div className="gen-preview-feature">🤖 Claude AI inside</div>
              <div className="gen-preview-feature">📱 Multi-screen</div>
            </div>
          </div>
        )}

        {generating && !generatedApp && (
          <div className="gen-preview-empty">
            <div className="gen-preview-empty-icon gen-preview-building">⚡</div>
            <h3>Building your app with {selectedModel === 'opus' ? 'Claude Opus' : 'Claude Sonnet'}...</h3>
            <p>Generating a complete React application with AI features. This takes 30–90 seconds.</p>
          </div>
        )}

        {generatedApp && liveCode && (
          <div className="gen-preview-container">
            <div className="gen-app-actions">
              <span className="gen-app-label">
                Live Preview — <strong>{generatedApp.name}</strong>
              </span>
              <div className="gen-app-action-btns">
                <button className="gen-action-btn" onClick={handleShare}>
                  {shareCopied ? '✓ Copied!' : '🔗 Share'}
                </button>
                <button className="gen-action-btn" onClick={handleDownload}>
                  ↓ Code
                </button>
                <button className="gen-action-btn gen-action-btn--primary" onClick={handleOpenApp}>
                  Open App ↗
                </button>
              </div>
            </div>
            <div className="gen-preview-iframe-wrap">
              <AppPreview
                code={liveCode}
                appId={generatedApp.id}
                height="100%"
              />
            </div>
          </div>
        )}

        {generatedApp && !liveCode && (
          <div className="gen-preview-empty">
            <div className="gen-preview-empty-icon">📱</div>
            <h3>{generatedApp.name}</h3>
            <p>{generatedApp.description}</p>
            <button className="gen-action-btn gen-action-btn--primary" onClick={handleOpenApp}>
              Open Full App ↗
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
