import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppPreview } from '../components/AppPreview';
import { useRecentApps } from '../hooks/useRecentApps';
import { useGenerator } from '../contexts/GeneratorContext';
import { TEMPLATES, type Template } from '../lib/templates';

const STEP_COUNT = 4;

export function GeneratorPage() {
  const {
    generatedApp,
    liveCode,
    generating,
    refining,
    pipelineStep,
    buildError,
    statusMessage,
    selectedModel,
    editHistory,
    generate,
    refine,
    resetProject,
    setSelectedModel,
  } = useGenerator();

  const [prompt, setPrompt] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<'preview' | 'code' | 'dashboard'>('preview');
  const [deviceFrame, setDeviceFrame] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [chatMode, setChatMode] = useState<'visual' | 'discuss'>('visual');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { apps: recentApps } = useRecentApps();

  const isWorking = generating || refining;
  const showLanding = !generatedApp && !generating;
  const showBuilder = !!generatedApp || generating;

  // Auto-scroll edit history
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [editHistory.length]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;
    setPrompt('');
    setRightPanelMode('preview');
    await generate(trimmed, selectedModel);
  }

  async function handleRefine(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || refining || !generatedApp) return;
    setPrompt('');
    await refine(trimmed);
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

  function handleCopyCode() {
    if (!liveCode) return;
    navigator.clipboard.writeText(liveCode).catch(() => {});
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  function handleNewProject() {
    resetProject();
    setPrompt('');
    setRightPanelMode('preview');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (generatedApp) {
        handleRefine(e as unknown as React.FormEvent);
      } else {
        handleGenerate(e as unknown as React.FormEvent);
      }
    }
  }

  function handleSelectTemplate(t: Template) {
    setPrompt(t.prompt);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  // ── SVG Icons ──
  const SendIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );

  const DesktopIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );

  const TabletIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );

  const MobileIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );

  // ════════════════════════════════════════════════════════════
  //  LANDING PAGE
  // ════════════════════════════════════════════════════════════
  if (showLanding) {
    return (
      <div className="landing">
        <header className="landing-topbar">
          <div className="landing-topbar-left">
            <div className="gen-logo-mark">S</div>
            <span className="gen-logo-text">StartBox</span>
            <span className="gen-logo-badge">Beta</span>
          </div>
          <div className="landing-topbar-right">
            <a href="/gallery" className="btn btn-ghost btn-sm">Gallery</a>
          </div>
        </header>

        <div className="landing-hero">
          <h1 className="landing-title">
            Let's make your dream a reality.
          </h1>
          <p className="landing-subtitle">
            Describe what you want to build and we'll create a fully-functional app for you in seconds. No coding necessary.
          </p>

          <form onSubmit={handleGenerate} className="landing-form">
            <div className="landing-textarea-wrap">
              <textarea
                ref={textareaRef}
                className="landing-textarea"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What do you want to build?"
                rows={4}
                disabled={isWorking}
              />
              <button
                type="submit"
                className="landing-send-btn"
                disabled={isWorking || !prompt.trim()}
              >
                {SendIcon}
              </button>
            </div>
            <div className="landing-options">
              <div className="model-selector">
                <label htmlFor="model-select">Model</label>
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value as 'sonnet' | 'opus')}
                  disabled={isWorking}
                >
                  <option value="sonnet">Sonnet (Fast)</option>
                  <option value="opus">Opus (Advanced)</option>
                </select>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-light)' }}>
                Cmd+Enter to submit
              </span>
            </div>
          </form>

          <div className="landing-chips">
            <span className="landing-chips-label">Not sure where to start? Try one of these:</span>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                className="landing-chip"
                onClick={() => handleSelectTemplate(t)}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {recentApps.length > 0 && (
          <div className="landing-social-proof">
            {recentApps.length} apps built so far
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  BUILDER VIEW
  // ════════════════════════════════════════════════════════════
  const navItems = generatedApp?.spec?.navigation ?? [];

  return (
    <div className="builder-layout">
      {/* ── Screen Sidebar (narrow left) ── */}
      <aside className="builder-screens">
        <div className="builder-screens-header">
          <div className="builder-screens-logo">S</div>
        </div>
        {navItems.map((nav) => (
          <button key={nav.id} className="builder-screen-item" title={nav.label}>
            <span className="builder-screen-icon">{nav.icon}</span>
            <span>{nav.label}</span>
          </button>
        ))}
        {navItems.length === 0 && generating && (
          <div style={{ padding: '12px 4px', textAlign: 'center' }}>
            <span className="spinner spinner-sm" style={{ color: 'var(--text-light)' }} />
          </div>
        )}
        <button className="builder-screen-add" title="New screen">+</button>
      </aside>

      {/* ── Left AI Panel ── */}
      <div className="builder-left">
        <div className="builder-left-header">
          <div className="gen-logo-mark" style={{ width: 24, height: 24, fontSize: 12, borderRadius: 6 }}>S</div>
          <span className="gen-logo-text">{generatedApp?.name ?? 'StartBox'}</span>
          <button className="builder-new-btn" onClick={handleNewProject} title="New project">+</button>
        </div>

        {/* Edit history */}
        <div className="builder-edit-history">
          {/* Build progress during generation */}
          {generating && (
            <div className="build-status">
              <div className="build-status-header">
                <span className="build-status-title">Building project...</span>
                <span className="build-status-step">
                  Step {Math.min(pipelineStep + 1, STEP_COUNT)} of {STEP_COUNT}
                </span>
              </div>
              <div className="build-progress-bar">
                <div
                  className="build-progress-fill"
                  style={{ width: `${((pipelineStep + 1) / STEP_COUNT) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Edit history entries */}
          {editHistory.map((entry) => (
            <div key={entry.id} className={`edit-entry edit-entry--${entry.status}`}>
              <span className="edit-entry-icon">
                {entry.status === 'completed' && '✓'}
                {entry.status === 'in_progress' && <span className="spinner spinner-sm" />}
                {entry.status === 'failed' && '✗'}
                {entry.status === 'pending' && '○'}
              </span>
              <span className="edit-entry-text">{entry.summary}</span>
            </div>
          ))}

          {/* AI response */}
          {statusMessage && !generating && (
            <div className="builder-ai-message">
              <p>{statusMessage}</p>
            </div>
          )}

          {/* Error */}
          {buildError && (
            <div className="status-message status-message--error" style={{ marginTop: 8 }}>
              {buildError}
            </div>
          )}

          <div ref={historyEndRef} />
        </div>

        {/* Bottom: tabs + chat input */}
        <div className="builder-left-footer">
          <div className="builder-left-tabs">
            <button
              className={`builder-tab${chatMode === 'visual' ? ' active' : ''}`}
              onClick={() => setChatMode('visual')}
            >
              Visual Edit
            </button>
            <button
              className={`builder-tab${chatMode === 'discuss' ? ' active' : ''}`}
              onClick={() => setChatMode('discuss')}
            >
              Discuss
            </button>
          </div>

          <form
            onSubmit={generatedApp ? handleRefine : handleGenerate}
            className="builder-chat-input"
          >
            <textarea
              className="builder-chat-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={generatedApp ? 'What would you like to change?' : 'Describe your app...'}
              rows={2}
              disabled={isWorking}
            />
            <button
              type="submit"
              className="builder-send-btn"
              disabled={isWorking || !prompt.trim()}
            >
              {SendIcon}
            </button>
          </form>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="builder-right">
        {/* Toolbar */}
        <div className="builder-toolbar">
          <div className="builder-toolbar-left">
            {generatedApp && (
              <span className="builder-app-name">{generatedApp.name}</span>
            )}
            {generating && !generatedApp && (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Building...
              </span>
            )}
          </div>

          <div className="builder-toolbar-center">
            <div className="view-toggle">
              <button
                className={`view-toggle-btn${rightPanelMode === 'dashboard' ? ' active' : ''}`}
                onClick={() => setRightPanelMode('dashboard')}
              >
                Dashboard
              </button>
              <button
                className={`view-toggle-btn${rightPanelMode === 'preview' ? ' active' : ''}`}
                onClick={() => setRightPanelMode('preview')}
              >
                Preview
              </button>
              <button
                className={`view-toggle-btn${rightPanelMode === 'code' ? ' active' : ''}`}
                onClick={() => setRightPanelMode('code')}
              >
                Code
              </button>
            </div>
          </div>

          <div className="builder-toolbar-right">
            <div className="device-toggles">
              <button
                className={`device-btn${deviceFrame === 'desktop' ? ' active' : ''}`}
                onClick={() => setDeviceFrame('desktop')}
                title="Desktop"
              >
                {DesktopIcon}
              </button>
              <button
                className={`device-btn${deviceFrame === 'tablet' ? ' active' : ''}`}
                onClick={() => setDeviceFrame('tablet')}
                title="Tablet"
              >
                {TabletIcon}
              </button>
              <button
                className={`device-btn${deviceFrame === 'mobile' ? ' active' : ''}`}
                onClick={() => setDeviceFrame('mobile')}
                title="Mobile"
              >
                {MobileIcon}
              </button>
            </div>

            <button className="btn btn-secondary btn-sm" onClick={handleShare} disabled={!generatedApp}>
              {shareCopied ? 'Copied' : 'Share'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleOpenApp} disabled={!generatedApp}>
              Publish
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="builder-preview-area">
          {/* Preview mode */}
          {rightPanelMode === 'preview' && liveCode && (
            <div className={`preview-device-frame preview-device-${deviceFrame}`}>
              <AppPreview code={liveCode} appId={generatedApp?.id ?? ''} height="100%" />
            </div>
          )}

          {rightPanelMode === 'preview' && !liveCode && (
            <div className="preview-empty">
              {generating ? (
                <>
                  <span className="spinner spinner-lg" />
                  <p>Building your project...</p>
                </>
              ) : (
                <>
                  <h3>No preview available</h3>
                  <p>Generate an app to see a live preview here.</p>
                </>
              )}
            </div>
          )}

          {/* Code mode */}
          {rightPanelMode === 'code' && (
            <div className="builder-code-panel">
              <div className="code-panel-header">
                <span>
                  {generatedApp?.name?.replace(/\s+/g, '-').toLowerCase() ?? 'app'}.jsx
                  {liveCode && ` — ${liveCode.split('\n').length} lines`}
                </span>
                <div className="code-panel-actions">
                  <button className="btn btn-ghost btn-xs" style={{ color: '#cdd6f4' }} onClick={handleCopyCode}>
                    {codeCopied ? 'Copied' : 'Copy'}
                  </button>
                  <button className="btn btn-ghost btn-xs" style={{ color: '#cdd6f4' }} onClick={handleDownload}>
                    Download
                  </button>
                </div>
              </div>
              <div className="code-block" style={{ maxHeight: 'none', borderRadius: 0 }}>
                <pre><code>{liveCode ?? '// No code generated yet'}</code></pre>
              </div>
            </div>
          )}

          {/* Dashboard mode */}
          {rightPanelMode === 'dashboard' && generatedApp && (
            <div className="builder-dashboard">
              <h2>{generatedApp.name}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
                {generatedApp.description}
              </p>

              <div className="dashboard-info-grid">
                <div className="dashboard-info-card">
                  <div className="dashboard-info-label">Share URL</div>
                  <div className="dashboard-info-value">
                    <code className="dashboard-share-url">/share/{generatedApp.short_id}</code>
                  </div>
                </div>
                <div className="dashboard-info-card">
                  <div className="dashboard-info-label">Model</div>
                  <div className="dashboard-info-value">
                    {selectedModel === 'opus' ? 'Claude Opus' : 'Claude Sonnet'}
                  </div>
                </div>
                <div className="dashboard-info-card">
                  <div className="dashboard-info-label">Screens</div>
                  <div className="dashboard-info-value">{generatedApp.spec.screens.length}</div>
                </div>
                <div className="dashboard-info-card">
                  <div className="dashboard-info-label">Theme</div>
                  <div className="dashboard-info-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: generatedApp.spec.theme?.primary ?? 'var(--brand)',
                      display: 'inline-block',
                      border: '1px solid var(--border)',
                    }} />
                    {generatedApp.spec.theme?.style ?? 'light'}
                  </div>
                </div>
                <div className="dashboard-info-card">
                  <div className="dashboard-info-label">App ID</div>
                  <div className="dashboard-info-value">
                    <code className="dashboard-share-url">{generatedApp.short_id}</code>
                  </div>
                </div>
                <div className="dashboard-info-card">
                  <div className="dashboard-info-label">Tagline</div>
                  <div className="dashboard-info-value">{generatedApp.tagline || '--'}</div>
                </div>
              </div>

              {statusMessage && (
                <div className="status-message status-message--success">
                  {statusMessage}
                </div>
              )}
            </div>
          )}

          {rightPanelMode === 'dashboard' && !generatedApp && (
            <div className="preview-empty">
              {generating ? (
                <>
                  <span className="spinner spinner-lg" />
                  <p>Building your project...</p>
                </>
              ) : (
                <p>Generate an app to see details here.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
