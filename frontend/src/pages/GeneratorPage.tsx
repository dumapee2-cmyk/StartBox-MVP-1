import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppPreview } from '../components/AppPreview';
import { useRecentApps } from '../hooks/useRecentApps';
import { useGenerator } from '../contexts/GeneratorContext';
import { TEMPLATES, type Template } from '../lib/templates';

const STEP_COUNT = 4;

type DashSection = 'overview' | 'data' | 'code' | 'logs' | 'api' | 'settings';

const NAV_ITEMS: { id: DashSection; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'data', label: 'Data' },
  { id: 'code', label: 'Code' },
  { id: 'logs', label: 'Logs' },
  { id: 'api', label: 'API' },
  { id: 'settings', label: 'Settings' },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function GeneratorPage() {
  // Context: generation state that survives navigation
  const {
    generatedApp,
    liveCode,
    generating,
    refining,
    pipelineStep,
    buildError,
    statusMessage,
    selectedModel,
    generate,
    refine,
    resetProject,
    setSelectedModel,
  } = useGenerator();

  // Local: UI-only state (fine to reset on navigation)
  const [prompt, setPrompt] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'create' | 'templates'>('create');
  const [activeSection, setActiveSection] = useState<DashSection>('overview');
  const [viewMode, setViewMode] = useState<'dashboard' | 'preview'>('dashboard');
  const [codeCopied, setCodeCopied] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const { apps: recentApps } = useRecentApps();

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;
    setPrompt('');
    setActiveSection('overview');
    setViewMode('dashboard');
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
    setActiveTab('create');
    setViewMode('dashboard');
    setActiveSection('overview');
  }

  const isWorking = generating || refining;

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
    setActiveTab('create');
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  const filteredApps = recentApps.filter((app) =>
    app.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalApps = recentApps.length;
  const totalRuns = recentApps.reduce((sum, app) => sum + app.run_count, 0);
  const lastActive =
    recentApps.length > 0 ? timeAgo(recentApps[0].created_at) : '--';

  const showHomeView = !generatedApp && !generating;
  const showDashboard = !!generatedApp && !generating;

  function renderDashboardContent() {
    if (!generatedApp) return null;
    const spec = generatedApp.spec;

    switch (activeSection) {
      case 'overview':
        return (
          <div className="dash-section">
            <div className="dash-section-header">
              <h2>{generatedApp.name}</h2>
              <div className="dash-header-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleShare}
                >
                  {shareCopied ? 'Copied' : 'Share'}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleOpenApp}
                >
                  Open App
                </button>
              </div>
            </div>
            <p className="dash-description">{generatedApp.description}</p>

            {statusMessage && (
              <div className="status-message status-message--success">
                {statusMessage}
              </div>
            )}

            <div className="dash-cards">
              <div className="dash-card">
                <div className="dash-card-label">Share URL</div>
                <div className="dash-card-value">
                  <code className="dash-url">/share/{generatedApp.short_id}</code>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleShare}
                  >
                    {shareCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className="dash-card">
                <div className="dash-card-label">Model</div>
                <div className="dash-card-value">
                  {selectedModel === 'opus' ? 'Claude Opus' : 'Claude Sonnet'}
                </div>
              </div>
              <div className="dash-card">
                <div className="dash-card-label">Screens</div>
                <div className="dash-card-value">{spec.screens.length}</div>
              </div>
              <div className="dash-card">
                <div className="dash-card-label">Theme</div>
                <div className="dash-card-value">
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: spec.theme?.primary ?? 'var(--brand)',
                      display: 'inline-block',
                      border: '1px solid var(--border)',
                    }}
                  />
                  {spec.theme?.style ?? 'light'}
                </div>
              </div>
              <div className="dash-card">
                <div className="dash-card-label">App ID</div>
                <div className="dash-card-value">
                  <code className="dash-url">{generatedApp.short_id}</code>
                </div>
              </div>
              <div className="dash-card">
                <div className="dash-card-label">Tagline</div>
                <div className="dash-card-value">
                  {generatedApp.tagline || '--'}
                </div>
              </div>
            </div>

            <div className="dash-card" style={{ marginTop: 16 }}>
              <div className="dash-card-label">Original Prompt</div>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                  marginTop: 6,
                }}
              >
                {generatedApp.description}
              </p>
            </div>
          </div>
        );

      case 'data':
        return (
          <div className="dash-section">
            <div className="dash-section-header">
              <h2>Data</h2>
            </div>
            <p className="dash-section-subtitle">
              Application structure and screen configuration.
            </p>

            {spec.navigation.length > 0 && (
              <>
                <h3 className="dash-table-title">
                  Navigation ({spec.navigation.length})
                </h3>
                <div className="apps-table-wrap">
                  <table className="apps-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Label</th>
                        <th>Icon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spec.navigation.map((nav) => (
                        <tr key={nav.id}>
                          <td>
                            <code>{nav.id}</code>
                          </td>
                          <td>{nav.label}</td>
                          <td>{nav.icon}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {spec.screens.length > 0 && (
              <>
                <h3 className="dash-table-title" style={{ marginTop: 24 }}>
                  Screens ({spec.screens.length})
                </h3>
                <div className="apps-table-wrap">
                  <table className="apps-table">
                    <thead>
                      <tr>
                        <th>Screen</th>
                        <th>Layout</th>
                        <th>Fields</th>
                        <th>Output</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spec.screens.map((screen) => (
                        <tr key={screen.nav_id}>
                          <td>
                            <strong>{screen.hero.title}</strong>
                          </td>
                          <td>
                            <code>{screen.layout}</code>
                          </td>
                          <td>{screen.input_fields.length}</td>
                          <td>
                            <code>{screen.output_format}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {spec.screens.map((screen) =>
                  screen.input_fields.length > 0 ? (
                    <div key={screen.nav_id} style={{ marginTop: 24 }}>
                      <h3 className="dash-table-title">
                        {screen.hero.title} — Input Fields
                      </h3>
                      <div className="apps-table-wrap">
                        <table className="apps-table">
                          <thead>
                            <tr>
                              <th>Key</th>
                              <th>Label</th>
                              <th>Type</th>
                              <th>Required</th>
                            </tr>
                          </thead>
                          <tbody>
                            {screen.input_fields.map((field) => (
                              <tr key={field.key}>
                                <td>
                                  <code>{field.key}</code>
                                </td>
                                <td>{field.label}</td>
                                <td>
                                  <code>{field.type}</code>
                                </td>
                                <td>{field.required ? 'Yes' : 'No'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null
                )}
              </>
            )}
          </div>
        );

      case 'code':
        return (
          <div className="dash-section">
            <div className="dash-section-header">
              <h2>Code</h2>
              <div className="dash-header-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleCopyCode}
                >
                  {codeCopied ? 'Copied' : 'Copy'}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleDownload}
                >
                  Download
                </button>
              </div>
            </div>

            {liveCode ? (
              <>
                <div className="code-meta">
                  <span>
                    {generatedApp.name.replace(/\s+/g, '-').toLowerCase()}.jsx
                  </span>
                  <span>{liveCode.split('\n').length} lines</span>
                </div>
                <div className="code-block">
                  <pre>
                    <code>{liveCode}</code>
                  </pre>
                </div>
              </>
            ) : (
              <p className="dash-empty">
                No generated code available for this app.
              </p>
            )}
          </div>
        );

      case 'logs':
        return (
          <div className="dash-section">
            <div className="dash-section-header">
              <h2>Logs</h2>
            </div>
            <p className="dash-section-subtitle">Build and execution history.</p>

            <div className="apps-table-wrap">
              <table className="apps-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Status</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>App generated</td>
                    <td>
                      <span className="status-dot status-dot--active" />
                      Success
                    </td>
                    <td>{formatDate(new Date().toISOString())}</td>
                  </tr>
                  {statusMessage?.includes('Changes applied') && (
                    <tr>
                      <td>Code refined</td>
                      <td>
                        <span className="status-dot status-dot--active" />
                        Success
                      </td>
                      <td>{formatDate(new Date().toISOString())}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="dash-empty" style={{ marginTop: 16 }}>
              Run history is available via{' '}
              <code>POST /api/apps/{generatedApp.id}/run</code>
            </p>
          </div>
        );

      case 'api': {
        const firstScreen = spec.screens[0];
        const sampleInputs = firstScreen
          ? Object.fromEntries(
              firstScreen.input_fields.map((f) => [f.key, `<${f.type}>`])
            )
          : {};
        const sampleNavId = firstScreen?.nav_id ?? '';

        return (
          <div className="dash-section">
            <div className="dash-section-header">
              <h2>API</h2>
            </div>
            <p className="dash-section-subtitle">
              Endpoints for programmatic access.
            </p>

            <h3 className="dash-table-title">Run App</h3>
            <div className="code-block">
              <pre>
                <code>
                  {`POST /api/apps/${generatedApp.id}/run
Content-Type: application/json

${JSON.stringify({ inputs: sampleInputs, nav_id: sampleNavId }, null, 2)}`}
                </code>
              </pre>
            </div>

            <h3 className="dash-table-title" style={{ marginTop: 24 }}>
              Get App
            </h3>
            <div className="code-block">
              <pre>
                <code>{`GET /api/apps/${generatedApp.id}`}</code>
              </pre>
            </div>

            <h3 className="dash-table-title" style={{ marginTop: 24 }}>
              Refine App
            </h3>
            <div className="code-block">
              <pre>
                <code>
                  {`POST /api/apps/${generatedApp.id}/refine
Content-Type: application/json

{"instruction": "Describe your changes here"}`}
                </code>
              </pre>
            </div>

            <h3 className="dash-table-title" style={{ marginTop: 24 }}>
              Share URL
            </h3>
            <div className="code-block">
              <pre>
                <code>{`GET /share/${generatedApp.short_id}`}</code>
              </pre>
            </div>
          </div>
        );
      }

      case 'settings':
        return (
          <div className="dash-section">
            <div className="dash-section-header">
              <h2>Settings</h2>
            </div>

            <div className="dash-cards">
              <div className="dash-card">
                <div className="dash-card-label">App Name</div>
                <div className="dash-card-value">{generatedApp.name}</div>
              </div>
              <div className="dash-card">
                <div className="dash-card-label">Tagline</div>
                <div className="dash-card-value">
                  {generatedApp.tagline || '--'}
                </div>
              </div>
              <div className="dash-card">
                <div className="dash-card-label">Theme Color</div>
                <div className="dash-card-value">
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      background: spec.theme?.primary ?? 'var(--brand)',
                      display: 'inline-block',
                      border: '1px solid var(--border)',
                    }}
                  />
                  {spec.theme?.primary ?? 'Default'}
                </div>
              </div>
              <div className="dash-card">
                <div className="dash-card-label">Theme Style</div>
                <div className="dash-card-value">
                  {spec.theme?.style ?? 'light'}
                </div>
              </div>
              <div className="dash-card">
                <div className="dash-card-label">Schema Version</div>
                <div className="dash-card-value">
                  <code className="dash-url">v{spec.schema_version}</code>
                </div>
              </div>
              <div className="dash-card">
                <div className="dash-card-label">Navigation Items</div>
                <div className="dash-card-value">{spec.navigation.length}</div>
              </div>
            </div>

            <div className="dash-card" style={{ marginTop: 16 }}>
              <div className="dash-card-label">App ID</div>
              <div className="dash-card-value" style={{ marginTop: 6 }}>
                <code className="dash-url">{generatedApp.id}</code>
              </div>
            </div>
            <div className="dash-card" style={{ marginTop: 12 }}>
              <div className="dash-card-label">Short ID</div>
              <div className="dash-card-value" style={{ marginTop: 6 }}>
                <code className="dash-url">{generatedApp.short_id}</code>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="gen-layout">
      {/* ── Top Bar ── */}
      <header className="gen-topbar">
        <div className="gen-topbar-left">
          <div className="gen-logo-mark">S</div>
          <span className="gen-logo-text">StartBox</span>
          <span className="gen-logo-badge">Beta</span>
          {generatedApp && (
            <>
              <span className="topbar-divider" />
              <span className="topbar-app-context">{generatedApp.name}</span>
            </>
          )}
        </div>
        <div className="gen-topbar-right">
          {showDashboard && (
            <div className="view-toggle">
              <button
                className={`view-toggle-btn${viewMode === 'dashboard' ? ' active' : ''}`}
                onClick={() => setViewMode('dashboard')}
              >
                Dashboard
              </button>
              <button
                className={`view-toggle-btn${viewMode === 'preview' ? ' active' : ''}`}
                onClick={() => setViewMode('preview')}
              >
                Preview
              </button>
            </div>
          )}
          <a href="/gallery" className="btn btn-ghost btn-sm">
            Gallery
          </a>
        </div>
      </header>

      {/* ── Left Sidebar ── */}
      <aside className="gen-sidebar">
        <div className="sidebar-section">
          <button className="btn btn-primary btn-full" onClick={handleNewProject}>
            New Project
          </button>
        </div>
        <div className="sidebar-section" style={{ flex: 1 }}>
          <div className="sidebar-section-label">Projects</div>
          <input
            className="sidebar-search"
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredApps.length === 0 && recentApps.length === 0 && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-light)',
                  padding: '8px 10px',
                }}
              >
                No projects yet.
              </div>
            )}
            {filteredApps.length === 0 && recentApps.length > 0 && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-light)',
                  padding: '8px 10px',
                }}
              >
                No matches found.
              </div>
            )}
            {filteredApps.slice(0, 10).map((app) => (
              <a
                key={app.id}
                href={`/app/${app.id}`}
                className="sidebar-app-item"
              >
                <span
                  className="sidebar-app-indicator"
                  style={{ background: app.theme_color ?? 'var(--brand)' }}
                />
                <span className="sidebar-app-name">{app.name}</span>
                {app.run_count > 0 && (
                  <span className="sidebar-app-runs">{app.run_count}</span>
                )}
              </a>
            ))}
            {filteredApps.length > 10 && (
              <a
                href="/gallery"
                className="sidebar-nav-link"
                style={{ marginTop: 4 }}
              >
                View all projects
              </a>
            )}
          </div>
        </div>
        <div className="sidebar-section">
          <a href="/gallery" className="sidebar-nav-link">
            Gallery
          </a>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="gen-main">
        {/* Home: Create + Overview */}
        {showHomeView && (
          <>
            <div className="gen-create-panel">
              <div className="create-form">
                <div
                  style={{
                    display: 'flex',
                    gap: 0,
                    borderBottom: '1px solid var(--border)',
                    marginBottom: 16,
                  }}
                >
                  <button
                    className={`app-nav-tab${activeTab === 'create' ? ' active' : ''}`}
                    onClick={() => setActiveTab('create')}
                  >
                    Create
                  </button>
                  <button
                    className={`app-nav-tab${activeTab === 'templates' ? ' active' : ''}`}
                    onClick={() => setActiveTab('templates')}
                  >
                    Templates
                  </button>
                </div>

                {activeTab === 'create' && (
                  <>
                    <h2 className="create-form-title">New project</h2>
                    <p className="create-form-subtitle">
                      Describe what you want to build.
                    </p>
                    <form onSubmit={handleGenerate}>
                      <div className="field">
                        <textarea
                          ref={textareaRef}
                          className="field-input field-textarea"
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="e.g. A task manager with priority levels and due date tracking"
                          rows={5}
                          disabled={isWorking}
                        />
                      </div>
                      <div className="model-selector">
                        <label htmlFor="model-select">Model</label>
                        <select
                          id="model-select"
                          value={selectedModel}
                          onChange={(e) =>
                            setSelectedModel(
                              e.target.value as 'sonnet' | 'opus'
                            )
                          }
                          disabled={isWorking}
                        >
                          <option value="sonnet">Sonnet (Fast)</option>
                          <option value="opus">Opus (Advanced)</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="btn btn-primary btn-lg btn-full"
                        disabled={isWorking || !prompt.trim()}
                        style={{ marginTop: 16 }}
                      >
                        Create Project
                      </button>
                      <span
                        style={{
                          color: 'var(--text-light)',
                          marginTop: 6,
                          display: 'block',
                          fontSize: 11,
                        }}
                      >
                        Cmd+Enter to submit
                      </span>
                    </form>
                  </>
                )}

                {activeTab === 'templates' && (
                  <div className="template-grid">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        className="template-card"
                        onClick={() => handleSelectTemplate(t)}
                      >
                        <div className="template-card-category">
                          {t.category}
                        </div>
                        <div className="template-card-name">{t.name}</div>
                        <div className="template-card-desc">
                          {t.description}
                        </div>
                        <div className="template-card-tags">
                          {t.tags.map((tag) => (
                            <span key={tag} className="template-tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="gen-preview-panel">
              <div className="workspace-overview">
                <div className="workspace-stats">
                  <div className="stat-card">
                    <div className="stat-card-value">{totalApps}</div>
                    <div className="stat-card-label">Projects</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card-value">{totalRuns}</div>
                    <div className="stat-card-label">Total Runs</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card-value">{lastActive}</div>
                    <div className="stat-card-label">Last Active</div>
                  </div>
                </div>

                <h3>Recent Projects</h3>
                {recentApps.length > 0 ? (
                  <div className="apps-table-wrap">
                    <table className="apps-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Status</th>
                          <th>Runs</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentApps.map((app) => (
                          <tr
                            key={app.id}
                            onClick={() => navigate(`/app/${app.id}`)}
                          >
                            <td>
                              <span className="apps-table-name">
                                {app.name}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`status-dot ${app.run_count > 0 ? 'status-dot--active' : 'status-dot--draft'}`}
                              />
                              {app.run_count > 0 ? 'Active' : 'New'}
                            </td>
                            <td>{app.run_count}</td>
                            <td>{timeAgo(app.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="workspace-empty">
                    <p>No projects yet. Create your first one to get started.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Building */}
        {generating && (
          <>
            <div className="gen-create-panel">
              <div className="create-form">
                <div className="build-status">
                  <div className="build-status-header">
                    <span className="build-status-title">
                      Building project...
                    </span>
                    <span className="build-status-step">
                      Step {Math.min(pipelineStep + 1, STEP_COUNT)} of{' '}
                      {STEP_COUNT}
                    </span>
                  </div>
                  <div className="build-progress-bar">
                    <div
                      className="build-progress-fill"
                      style={{
                        width: `${((pipelineStep + 1) / STEP_COUNT) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                {buildError && (
                  <div className="status-message status-message--error">
                    {buildError}
                  </div>
                )}
              </div>
            </div>

            <div className="gen-preview-panel">
              {liveCode ? (
                <div className="preview-container">
                  <div className="preview-actions">
                    <span className="preview-label">Preview</span>
                  </div>
                  <div className="preview-iframe-wrap">
                    <AppPreview code={liveCode} appId="" height="100%" />
                  </div>
                </div>
              ) : (
                <div className="preview-empty">
                  <div className="preview-empty-icon">
                    <span className="spinner spinner-lg" />
                  </div>
                  <p>Building your project...</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Dashboard mode */}
        {showDashboard && viewMode === 'dashboard' && (
          <>
            <nav className="dash-nav">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  className={`dash-nav-item${activeSection === item.id ? ' active' : ''}`}
                  onClick={() => setActiveSection(item.id)}
                >
                  {item.label}
                </button>
              ))}

              <div className="dash-nav-divider" />

              <div className="dash-refine">
                <div className="dash-refine-label">Refine</div>
                <form onSubmit={handleRefine}>
                  <textarea
                    className="field-input field-textarea"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe changes..."
                    rows={3}
                    disabled={isWorking}
                    style={{ fontSize: 12 }}
                  />
                  <div className="model-selector">
                    <label htmlFor="model-refine">Model</label>
                    <select
                      id="model-refine"
                      value={selectedModel}
                      onChange={(e) =>
                        setSelectedModel(e.target.value as 'sonnet' | 'opus')
                      }
                      disabled={isWorking}
                    >
                      <option value="sonnet">Sonnet</option>
                      <option value="opus">Opus</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary btn-full btn-sm"
                    disabled={isWorking || !prompt.trim()}
                    style={{ marginTop: 8 }}
                  >
                    {refining ? 'Updating...' : 'Apply Changes'}
                  </button>
                </form>
                {buildError && (
                  <div
                    className="status-message status-message--error"
                    style={{ marginTop: 8, fontSize: 12 }}
                  >
                    {buildError}
                  </div>
                )}
              </div>
            </nav>

            <div className="dash-content">{renderDashboardContent()}</div>
          </>
        )}

        {/* Preview mode */}
        {showDashboard && viewMode === 'preview' && (
          <div className="gen-preview-panel" style={{ flex: 1 }}>
            {liveCode ? (
              <div className="preview-container">
                <div className="preview-actions">
                  <span className="preview-label">
                    Preview —{' '}
                    <strong style={{ color: 'var(--text)' }}>
                      {generatedApp.name}
                    </strong>
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleShare}
                    >
                      {shareCopied ? 'Copied' : 'Share'}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleDownload}
                    >
                      Download
                    </button>
                  </div>
                </div>
                <div className="preview-iframe-wrap">
                  <AppPreview
                    code={liveCode}
                    appId={generatedApp.id}
                    height="100%"
                  />
                </div>
              </div>
            ) : (
              <div className="preview-empty">
                <h3>{generatedApp.name}</h3>
                <p>{generatedApp.description}</p>
                <button
                  className="btn btn-primary"
                  onClick={handleOpenApp}
                  style={{ marginTop: 12 }}
                >
                  Open App
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
