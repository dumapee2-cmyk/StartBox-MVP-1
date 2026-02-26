import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AppPreview, type HoveredElement } from '../components/AppPreview';
import { useRecentApps } from '../hooks/useRecentApps';
import { useGenerator } from '../contexts/GeneratorContext';
import { TEMPLATES, type Template } from '../lib/templates';

const STEP_COUNT = 4;

const STEP_LABELS = [
  'Analyzing prompt...',
  'Designing architecture...',
  'Generating code...',
  'Finalizing...',
];

const COLOR_PALETTES = [
  { colors: ['#ff6b35', '#ff8c42', '#ffa759'] },
  { colors: ['#f43f5e', '#fb7185', '#fda4af'] },
  { colors: ['#7c3aed', '#8b5cf6', '#a78bfa'] },
  { colors: ['#0d9488', '#14b8a6', '#2dd4bf'] },
  { colors: ['#d97706', '#f59e0b', '#fbbf24'] },
  { colors: ['#4f46e5', '#6366f1', '#818cf8'] },
];

const FLOATING_SHAPES = [
  { type: 'circle',  size: 180, top: '8%',  left: '5%',  anim: 'float-drift-1' },
  { type: 'circle',  size: 120, top: '70%', left: '80%', anim: 'float-drift-2' },
  { type: 'rounded', size: 200, top: '20%', left: '75%', anim: 'float-drift-3' },
  { type: 'rounded', size: 140, top: '60%', left: '10%', anim: 'float-drift-4' },
  { type: 'blob',    size: 160, top: '40%', left: '50%', anim: 'float-drift-5' },
  { type: 'circle',  size: 100, top: '85%', left: '40%', anim: 'float-drift-6' },
  { type: 'rounded', size: 90,  top: '15%', left: '40%', anim: 'float-drift-7' },
  { type: 'blob',    size: 220, top: '50%', left: '25%', anim: 'float-drift-8' },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface CodeFile {
  name: string;
  path: string;
  content: string;
  language: string;
  lineCount: number;
}

function parseCodeIntoFiles(code: string, appName: string): CodeFile[] {
  const slug = appName?.replace(/\s+/g, '-').toLowerCase() ?? 'app';
  const lines = code.split('\n');
  const files: CodeFile[] = [];

  // Try to split into logical sections
  let importLines: string[] = [];
  let componentBlocks: { name: string; lines: string[] }[] = [];
  let currentBlock: { name: string; lines: string[] } | null = null;
  let mainRender: string[] = [];
  let styleLines: string[] = [];
  let inStyleBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect style/CSS-in-JS blocks
    if (line.match(/^const\s+styles\s*=/) || line.match(/^const\s+\w*[Ss]tyle\w*\s*=/) || line.match(/^const\s+css\s*=/)) {
      inStyleBlock = true;
      styleLines.push(line);
      continue;
    }
    if (inStyleBlock) {
      styleLines.push(line);
      if (line.match(/^};?\s*$/) || line.match(/^\)\s*;?\s*$/)) {
        inStyleBlock = false;
      }
      continue;
    }

    // Import lines
    if (line.match(/^import\s/) || line.match(/^const\s+\{.*\}\s*=\s*(?:React|require)/)) {
      importLines.push(line);
      continue;
    }

    // Component definitions
    const fnMatch = line.match(/^(?:export\s+)?(?:default\s+)?function\s+(\w+)/);
    const constMatch = line.match(/^(?:export\s+)?const\s+(\w+)\s*=\s*(?:\(|function)/);
    if (fnMatch || constMatch) {
      if (currentBlock) {
        componentBlocks.push(currentBlock);
      }
      currentBlock = { name: (fnMatch?.[1] || constMatch?.[1])!, lines: [line] };
      continue;
    }

    // ReactDOM.render / createRoot
    if (line.match(/ReactDOM\.render|createRoot|\.render\(/) || line.match(/^const\s+root\s*=/)) {
      if (currentBlock) {
        componentBlocks.push(currentBlock);
        currentBlock = null;
      }
      mainRender.push(line);
      // Grab remaining lines
      for (let j = i + 1; j < lines.length; j++) {
        mainRender.push(lines[j]);
      }
      break;
    }

    if (currentBlock) {
      currentBlock.lines.push(line);
    } else {
      // Uncategorized lines go to imports or main
      if (lines.slice(0, i).some(l => l.match(/^import\s/))) {
        importLines.push(line);
      }
    }
  }
  if (currentBlock) componentBlocks.push(currentBlock);

  // Build file entries
  if (importLines.length > 0) {
    const content = importLines.join('\n');
    files.push({ name: 'dependencies', path: `${slug}/package.json`, content, language: 'json', lineCount: importLines.length });
  }

  for (const block of componentBlocks) {
    const content = block.lines.join('\n');
    files.push({
      name: block.name,
      path: `${slug}/components/${block.name}.jsx`,
      content,
      language: 'jsx',
      lineCount: block.lines.length,
    });
  }

  if (styleLines.length > 0) {
    const content = styleLines.join('\n');
    files.push({ name: 'styles', path: `${slug}/styles.js`, content, language: 'javascript', lineCount: styleLines.length });
  }

  if (mainRender.length > 0) {
    const content = mainRender.join('\n');
    files.push({ name: 'index', path: `${slug}/index.jsx`, content, language: 'jsx', lineCount: mainRender.length });
  }

  // If parsing didn't split much, just show as single file
  if (files.length <= 1) {
    return [{
      name: slug,
      path: `${slug}/App.jsx`,
      content: code,
      language: 'jsx',
      lineCount: lines.length,
    }];
  }

  return files;
}

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
    hasStartedGenerating,
    generate,
    refine,
    resetProject,
    setSelectedModel,
    retryGeneration,
  } = useGenerator();

  const [prompt, setPrompt] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<'preview' | 'code' | 'dashboard'>('preview');
  const [deviceFrame, setDeviceFrame] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [chatMode, setChatMode] = useState<'visual' | 'discuss'>('visual');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [dashboardTab, setDashboardTab] = useState('overview');
  const [customizeMode, setCustomizeMode] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<HoveredElement | null>(null);
  const [selectedElement, setSelectedElement] = useState<HoveredElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { apps: recentApps } = useRecentApps();

  const selectedPalette = useMemo(
    () => COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)],
    []
  );

  const isWorking = generating || refining;
  const showLanding = !generatedApp && !generating && !hasStartedGenerating;

  const codeFiles = useMemo(() => {
    if (!liveCode) return [];
    return parseCodeIntoFiles(liveCode, generatedApp?.name ?? 'app');
  }, [liveCode, generatedApp?.name]);

  function toggleFile(path: string) {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function expandAllFiles() {
    setExpandedFiles(new Set(codeFiles.map(f => f.path)));
  }

  function collapseAllFiles() {
    setExpandedFiles(new Set());
  }

  function getCustomizeSuggestions(el: HoveredElement): string[] {
    const tag = el.tagName.toLowerCase();
    const suggestions: string[] = [];

    if (tag === 'button' || tag === 'a') {
      suggestions.push('Change button color', 'Change button text', 'Make it rounded', 'Add an icon', 'Make it larger');
    } else if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
      suggestions.push('Change heading text', 'Change font size', 'Change color', 'Center the text');
    } else if (tag === 'p' || tag === 'span') {
      suggestions.push('Change text content', 'Change font size', 'Change color', 'Make it bold');
    } else if (tag === 'img') {
      suggestions.push('Change image', 'Add border radius', 'Add shadow', 'Resize image');
    } else if (tag === 'input' || tag === 'textarea') {
      suggestions.push('Change placeholder', 'Change border style', 'Make it wider', 'Add validation');
    } else if (tag === 'div' || tag === 'section') {
      suggestions.push('Change background color', 'Add padding', 'Add border', 'Change layout');
    } else if (tag === 'nav' || tag === 'header' || tag === 'footer') {
      suggestions.push('Change background', 'Change layout', 'Add logo', 'Change spacing');
    } else if (tag === 'li') {
      suggestions.push('Change list style', 'Change spacing', 'Add icon', 'Change color');
    } else {
      suggestions.push('Change color', 'Change size', 'Add border', 'Change spacing');
    }
    return suggestions;
  }

  function handleCustomizeSuggestion(suggestion: string) {
    if (!selectedElement) return;
    const tag = selectedElement.tagName.toLowerCase();
    const text = selectedElement.text.trim().slice(0, 30);
    const instruction = `${suggestion} on the ${tag} element${text ? ` "${text}"` : ''} — make it look better.`;
    setPrompt(instruction);
    setSelectedElement(null);
    setCustomizeMode(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function handleElementHover(el: HoveredElement | null) {
    setHoveredElement(el);
  }

  function handleElementClick(el: HoveredElement) {
    setSelectedElement(el);
  }

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
        {/* Animated background shapes */}
        <div className="landing-bg-shapes" aria-hidden="true">
          {FLOATING_SHAPES.map((shape, i) => (
            <div
              key={i}
              className={`landing-shape landing-shape--${shape.type} ${shape.anim}`}
              style={{
                width: shape.size,
                height: shape.type === 'rounded' ? shape.size * 0.6 : shape.size,
                top: shape.top,
                left: shape.left,
                background: selectedPalette.colors[i % selectedPalette.colors.length],
              }}
            />
          ))}
        </div>

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

        <div className="landing-body">
          {/* Past projects sidebar */}
          {recentApps.length > 0 && (
            <aside className="landing-sidebar">
              <div className="landing-sidebar-header">
                <h3>Recent Projects</h3>
              </div>
              <div className="landing-sidebar-list">
                {recentApps.slice(0, 10).map((app) => (
                  <Link
                    key={app.id}
                    to={`/app/${app.id}`}
                    className="landing-sidebar-item"
                  >
                    <div
                      className="landing-sidebar-icon"
                      style={{ background: app.theme_color ?? 'var(--brand)' }}
                    >
                      {app.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="landing-sidebar-info">
                      <span className="landing-sidebar-name">{app.name}</span>
                      <span className="landing-sidebar-time">{timeAgo(app.created_at)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </aside>
          )}

          {/* Hero content */}
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
          <Link to="/" className="builder-screens-logo" title="Back to home" onClick={handleNewProject}>S</Link>
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
          <Link to="/" onClick={handleNewProject} className="gen-logo-mark" style={{ width: 24, height: 24, fontSize: 12, borderRadius: 6, textDecoration: 'none' }}>S</Link>
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

            {rightPanelMode === 'preview' && (
              <button
                className={`btn btn-sm${customizeMode ? ' btn-primary' : ' btn-secondary'}`}
                onClick={() => { setCustomizeMode(!customizeMode); setSelectedElement(null); }}
                disabled={!generatedApp}
                title="Click to customize elements by hovering"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                {customizeMode ? 'Editing' : 'Customize'}
              </button>
            )}

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
            <div className={`preview-device-frame preview-device-${deviceFrame}${customizeMode ? ' customize-active' : ''}`} ref={previewContainerRef}>
              <AppPreview
                code={liveCode}
                appId={generatedApp?.id ?? ''}
                height="100%"
                customizeMode={customizeMode}
                onElementHover={handleElementHover}
                onElementClick={handleElementClick}
              />

              {/* Customize popup on element click */}
              {customizeMode && selectedElement && (
                <div className="customize-popup" style={{
                  top: Math.min(selectedElement.rect.top + selectedElement.rect.height + 8, (previewContainerRef.current?.clientHeight ?? 500) - 200),
                  left: Math.min(Math.max(selectedElement.rect.left, 8), (previewContainerRef.current?.clientWidth ?? 500) - 240),
                }}>
                  <div className="customize-popup-header">
                    <span className="customize-popup-tag">{selectedElement.tagName.toLowerCase()}</span>
                    <span className="customize-popup-text">
                      {selectedElement.text.trim().slice(0, 25) || 'Element'}
                    </span>
                    <button className="customize-popup-close" onClick={() => setSelectedElement(null)}>&times;</button>
                  </div>
                  <div className="customize-popup-suggestions">
                    {getCustomizeSuggestions(selectedElement).map((suggestion) => (
                      <button
                        key={suggestion}
                        className="customize-suggestion-btn"
                        onClick={() => handleCustomizeSuggestion(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                  <div className="customize-popup-styles">
                    <div className="customize-style-row">
                      <span>Color</span>
                      <span className="customize-style-value">
                        <span className="customize-color-swatch" style={{ background: selectedElement.styles.color }} />
                        {selectedElement.styles.color}
                      </span>
                    </div>
                    <div className="customize-style-row">
                      <span>Background</span>
                      <span className="customize-style-value">
                        <span className="customize-color-swatch" style={{ background: selectedElement.styles.backgroundColor }} />
                        {selectedElement.styles.backgroundColor}
                      </span>
                    </div>
                    <div className="customize-style-row">
                      <span>Font Size</span>
                      <span className="customize-style-value">{selectedElement.styles.fontSize}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom bar showing hovered element info */}
              {customizeMode && hoveredElement && !selectedElement && (
                <div className="customize-hover-bar">
                  <span className="customize-hover-tag">{hoveredElement.tagName.toLowerCase()}</span>
                  <span className="customize-hover-text">
                    {hoveredElement.text.trim().slice(0, 40) || 'Empty element'}
                  </span>
                  <span className="customize-hover-hint">Click to customize</span>
                </div>
              )}
            </div>
          )}

          {rightPanelMode === 'preview' && !liveCode && (
            <div className="preview-empty">
              {generating ? (
                <div className="generation-loading">
                  <div className="generation-ring">
                    <svg viewBox="0 0 120 120" className="generation-ring-svg">
                      <circle className="generation-ring-track" cx="60" cy="60" r="52" fill="none" strokeWidth="6" />
                      <circle
                        className="generation-ring-fill"
                        cx="60" cy="60" r="52"
                        fill="none" strokeWidth="6"
                        strokeDasharray={`${2 * Math.PI * 52}`}
                        strokeDashoffset={`${2 * Math.PI * 52 * (1 - (pipelineStep + 1) / STEP_COUNT)}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="generation-ring-step">
                      {pipelineStep + 1}/{STEP_COUNT}
                    </span>
                  </div>
                  <p className="generation-label">
                    {STEP_LABELS[Math.min(pipelineStep, STEP_LABELS.length - 1)]}
                  </p>
                  <div className="generation-dots">
                    <span className="generation-dot" />
                    <span className="generation-dot" />
                    <span className="generation-dot" />
                  </div>
                </div>
              ) : buildError && hasStartedGenerating ? (
                <div className="generation-error">
                  <div className="generation-error-icon">!</div>
                  <h3>Generation Failed</h3>
                  <p className="generation-error-message">{buildError}</p>
                  <div className="generation-error-actions">
                    <button className="btn btn-primary" onClick={retryGeneration}>
                      Retry
                    </button>
                    <button className="btn btn-secondary" onClick={handleNewProject}>
                      Start Over
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h3>No preview available</h3>
                  <p>Generate an app to see a live preview here.</p>
                </>
              )}
            </div>
          )}

          {/* Code mode — collapsible file viewer */}
          {rightPanelMode === 'code' && (
            <div className="builder-code-panel">
              <div className="code-panel-header">
                <span className="code-panel-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3z" /><path d="M9 3v18" /><path d="M3 9h6" /></svg>
                  {generatedApp?.name?.replace(/\s+/g, '-').toLowerCase() ?? 'app'}
                  <span className="code-panel-count">{codeFiles.length} files</span>
                </span>
                <div className="code-panel-actions">
                  <button className="btn btn-ghost btn-xs" style={{ color: '#cdd6f4' }} onClick={expandedFiles.size === codeFiles.length ? collapseAllFiles : expandAllFiles}>
                    {expandedFiles.size === codeFiles.length ? 'Collapse All' : 'Expand All'}
                  </button>
                  <button className="btn btn-ghost btn-xs" style={{ color: '#cdd6f4' }} onClick={handleCopyCode}>
                    {codeCopied ? 'Copied' : 'Copy All'}
                  </button>
                </div>
              </div>
              <div className="code-files-list">
                {codeFiles.map((file) => (
                  <div key={file.path} className="code-file-item">
                    <button
                      className={`code-file-header${expandedFiles.has(file.path) ? ' expanded' : ''}`}
                      onClick={() => toggleFile(file.path)}
                    >
                      <span className="code-file-chevron">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>
                      <span className="code-file-icon">
                        {file.language === 'jsx' ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#61dafb" strokeWidth="2"><path d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M12 21.5c-3.04 0-5.95-.71-8.18-2a.73.73 0 0 1-.32-.63c0-2.62 3.81-4.87 8.5-4.87s8.5 2.25 8.5 4.87c0 .24-.12.47-.32.63C17.95 20.79 15.04 21.5 12 21.5z" /></svg>
                        ) : file.language === 'json' ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f1c40f" strokeWidth="2"><path d="M7 7h10v10H7z" /><path d="M12 3v4m0 10v4M3 12h4m10 0h4" /></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a6e3a1" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>
                        )}
                      </span>
                      <span className="code-file-name">{file.path}</span>
                      <span className="code-file-lines">{file.lineCount} lines</span>
                    </button>
                    {expandedFiles.has(file.path) && (
                      <div className="code-file-content">
                        <pre><code>{file.content}</code></pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dashboard mode — full sidebar dashboard */}
          {rightPanelMode === 'dashboard' && generatedApp && (
            <div className="dash-layout">
              <nav className="dash-sidebar">
                <div className="dash-sidebar-section">
                  <div className="dash-sidebar-heading">General</div>
                  {[
                    { id: 'overview', icon: '📊', label: 'Overview' },
                    { id: 'users', icon: '👥', label: 'Users' },
                    { id: 'data', icon: '🗄️', label: 'Data' },
                    { id: 'analytics', icon: '📈', label: 'Analytics' },
                  ].map(item => (
                    <button
                      key={item.id}
                      className={`dash-sidebar-item${dashboardTab === item.id ? ' active' : ''}`}
                      onClick={() => setDashboardTab(item.id)}
                    >
                      <span className="dash-sidebar-icon">{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="dash-sidebar-section">
                  <div className="dash-sidebar-heading">Configure</div>
                  {[
                    { id: 'domains', icon: '🌐', label: 'Domains' },
                    { id: 'integrations', icon: '🔗', label: 'Integrations' },
                    { id: 'security', icon: '🔒', label: 'Security' },
                  ].map(item => (
                    <button
                      key={item.id}
                      className={`dash-sidebar-item${dashboardTab === item.id ? ' active' : ''}`}
                      onClick={() => setDashboardTab(item.id)}
                    >
                      <span className="dash-sidebar-icon">{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="dash-sidebar-section">
                  <div className="dash-sidebar-heading">Developer</div>
                  {[
                    { id: 'code', icon: '💻', label: 'Code' },
                    { id: 'agents', icon: '🤖', label: 'Agents' },
                    { id: 'automations', icon: '⚡', label: 'Automations' },
                    { id: 'logs', icon: '📋', label: 'Logs' },
                    { id: 'api', icon: '🔌', label: 'API' },
                    { id: 'settings', icon: '⚙️', label: 'Settings' },
                  ].map(item => (
                    <button
                      key={item.id}
                      className={`dash-sidebar-item${dashboardTab === item.id ? ' active' : ''}`}
                      onClick={() => setDashboardTab(item.id)}
                    >
                      <span className="dash-sidebar-icon">{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              </nav>

              <div className="dash-main">
                {dashboardTab === 'overview' && (
                  <div className="dash-content">
                    <div className="dash-page-header">
                      <h2>Overview</h2>
                      <p className="dash-page-desc">{generatedApp.description}</p>
                    </div>
                    <div className="dash-stats-row">
                      <div className="dash-stat-card">
                        <div className="dash-stat-value">{generatedApp.spec.screens.length}</div>
                        <div className="dash-stat-label">Screens</div>
                      </div>
                      <div className="dash-stat-card">
                        <div className="dash-stat-value">{editHistory.length}</div>
                        <div className="dash-stat-label">Total Runs</div>
                      </div>
                      <div className="dash-stat-card">
                        <div className="dash-stat-value">{editHistory.length}</div>
                        <div className="dash-stat-label">Edits</div>
                      </div>
                      <div className="dash-stat-card">
                        <div className="dash-stat-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <span style={{ width: 14, height: 14, borderRadius: 4, background: generatedApp.spec.theme?.primary ?? 'var(--brand)', display: 'inline-block', border: '1px solid var(--border)' }} />
                          {generatedApp.spec.theme?.style ?? 'light'}
                        </div>
                        <div className="dash-stat-label">Theme</div>
                      </div>
                    </div>

                    <div className="dash-info-grid">
                      <div className="dash-info-card">
                        <div className="dash-info-label">App Name</div>
                        <div className="dash-info-value">{generatedApp.name}</div>
                      </div>
                      <div className="dash-info-card">
                        <div className="dash-info-label">App ID</div>
                        <div className="dash-info-value"><code>{generatedApp.short_id}</code></div>
                      </div>
                      <div className="dash-info-card">
                        <div className="dash-info-label">Share URL</div>
                        <div className="dash-info-value"><code>/share/{generatedApp.short_id}</code></div>
                      </div>
                      <div className="dash-info-card">
                        <div className="dash-info-label">Model</div>
                        <div className="dash-info-value">{selectedModel === 'opus' ? 'Claude Opus' : 'Claude Sonnet'}</div>
                      </div>
                      <div className="dash-info-card">
                        <div className="dash-info-label">Tagline</div>
                        <div className="dash-info-value">{generatedApp.tagline || '—'}</div>
                      </div>
                      <div className="dash-info-card">
                        <div className="dash-info-label">Navigation Items</div>
                        <div className="dash-info-value">{generatedApp.spec.navigation.length}</div>
                      </div>
                    </div>

                    {statusMessage && (
                      <div className="status-message status-message--success">{statusMessage}</div>
                    )}
                  </div>
                )}

                {dashboardTab === 'users' && (
                  <div className="dash-content">
                    <div className="dash-page-header">
                      <h2>Users</h2>
                      <p className="dash-page-desc">Manage app users and permissions.</p>
                    </div>
                    <div className="dash-empty-state">
                      <span className="dash-empty-icon">👥</span>
                      <h3>No users yet</h3>
                      <p>Users will appear here once your app is published and people start using it.</p>
                    </div>
                  </div>
                )}

                {dashboardTab === 'data' && (
                  <div className="dash-content">
                    <div className="dash-page-header">
                      <h2>Data</h2>
                      <p className="dash-page-desc">View and manage your app's data collections.</p>
                    </div>
                    <div className="dash-table-card">
                      <div className="dash-table-header">
                        <span>Collection</span><span>Records</span><span>Last Modified</span>
                      </div>
                      {generatedApp.spec.screens.map(screen => (
                        <div key={screen.nav_id} className="dash-table-row">
                          <span>{screen.hero.title}</span>
                          <span>0</span>
                          <span>Just now</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dashboardTab === 'analytics' && (
                  <div className="dash-content">
                    <div className="dash-page-header">
                      <h2>Analytics</h2>
                      <p className="dash-page-desc">Track usage and performance metrics.</p>
                    </div>
                    <div className="dash-stats-row">
                      <div className="dash-stat-card">
                        <div className="dash-stat-value">{editHistory.length}</div>
                        <div className="dash-stat-label">Page Views</div>
                      </div>
                      <div className="dash-stat-card">
                        <div className="dash-stat-value">0</div>
                        <div className="dash-stat-label">Unique Users</div>
                      </div>
                      <div className="dash-stat-card">
                        <div className="dash-stat-value">0s</div>
                        <div className="dash-stat-label">Avg. Session</div>
                      </div>
                    </div>
                    <div className="dash-chart-placeholder">
                      <div className="dash-empty-icon">📈</div>
                      <p>Analytics charts will appear here once your app receives traffic.</p>
                    </div>
                  </div>
                )}

                {dashboardTab === 'domains' && (
                  <div className="dash-content">
                    <div className="dash-page-header">
                      <h2>Domains</h2>
                      <p className="dash-page-desc">Configure custom domains for your app.</p>
                    </div>
                    <div className="dash-domain-card">
                      <div className="dash-domain-row">
                        <div className="dash-domain-url">
                          <span className="dash-domain-badge">Default</span>
                          {window.location.origin}/share/{generatedApp.short_id}
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={handleShare}>
                          {shareCopied ? 'Copied' : 'Copy URL'}
                        </button>
                      </div>
                    </div>
                    <button className="btn btn-secondary" style={{ marginTop: 12 }}>+ Add Custom Domain</button>
                  </div>
                )}

                {dashboardTab === 'integrations' && (
                  <div className="dash-content">
                    <div className="dash-page-header">
                      <h2>Integrations</h2>
                      <p className="dash-page-desc">Connect third-party services to your app.</p>
                    </div>
                    <div className="dash-integrations-grid">
                      {['Stripe', 'Slack', 'Google Sheets', 'Zapier', 'Twilio', 'SendGrid'].map(name => (
                        <div key={name} className="dash-integration-card">
                          <div className="dash-integration-name">{name}</div>
                          <button className="btn btn-secondary btn-xs">Connect</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dashboardTab === 'security' && (
                  <div className="dash-content">
                    <div className="dash-page-header">
                      <h2>Security</h2>
                      <p className="dash-page-desc">Manage authentication and access controls.</p>
                    </div>
                    <div className="dash-info-grid">
                      <div className="dash-info-card">
                        <div className="dash-info-label">Authentication</div>
                        <div className="dash-info-value">Public (no auth)</div>
                      </div>
                      <div className="dash-info-card">
                        <div className="dash-info-label">HTTPS</div>
                        <div className="dash-info-value" style={{ color: 'var(--success)' }}>Enabled</div>
                      </div>
                      <div className="dash-info-card">
                        <div className="dash-info-label">CORS</div>
                        <div className="dash-info-value">Allow all origins</div>
                      </div>
                      <div className="dash-info-card">
                        <div className="dash-info-label">Rate Limiting</div>
                        <div className="dash-info-value">100 req/min</div>
                      </div>
                    </div>
                  </div>
                )}

                {dashboardTab === 'code' && (
                  <div className="dash-content">
                    <div className="dash-page-header">
                      <h2>Code</h2>
                      <p className="dash-page-desc">View and export your app's source code.</p>
                    </div>
                    <div className="dash-code-actions">
                      <button className="btn btn-primary btn-sm" onClick={() => setRightPanelMode('code')}>Open Code Viewer</button>
                      <button className="btn btn-secondary btn-sm" onClick={handleCopyCode}>{codeCopied ? 'Copied' : 'Copy Code'}</button>
                      <button className="btn btn-secondary btn-sm" onClick={handleDownload}>Download .jsx</button>
                    </div>
                    <div className="dash-info-grid" style={{ marginTop: 16 }}>
                      <div className="dash-info-card">
                        <div className="dash-info-label">Language</div>
                        <div className="dash-info-value">React JSX</div>
                      </div>
                      <div className="dash-info-card">
                        <div className="dash-info-label">Lines of Code</div>
                        <div className="dash-info-value">{liveCode?.split('\n').length ?? 0}</div>
                      </div>
                      <div className="dash-info-card">
                        <div className="dash-info-label">Files</div>
                        <div className="dash-info-value">{codeFiles.length}</div>
                      </div>
                      <div className="dash-info-card">
                        <div className="dash-info-label">Framework</div>
                        <div className="dash-info-value">React 18 + Tailwind</div>
                      </div>
                    </div>
                  </div>
                )}

                {dashboardTab === 'agents' && (
                  <div className="dash-content">
                    <div className="dash-page-header">
                      <h2>Agents</h2>
                      <p className="dash-page-desc">Configure AI agents for your app.</p>
                    </div>
                    <div className="dash-info-grid">
                      <div className="dash-info-card">
                        <div className="dash-info-label">AI Model</div>
                        <div className="dash-info-value">{selectedModel === 'opus' ? 'Claude Opus' : 'Claude Sonnet'}</div>
                      </div>
                      <div className="dash-info-card">
                        <div className="dash-info-label">AI Calls</div>
                        <div className="dash-info-value">{editHistory.length}</div>
                      </div>
                    </div>
                    <div className="dash-empty-state" style={{ marginTop: 16 }}>
                      <span className="dash-empty-icon">🤖</span>
                      <h3>Default Agent Active</h3>
                      <p>Your app uses the built-in AI agent. Add custom agents for specialized behavior.</p>
                    </div>
                  </div>
                )}

                {dashboardTab === 'automations' && (
                  <div className="dash-content">
                    <div className="dash-page-header">
                      <h2>Automations</h2>
                      <p className="dash-page-desc">Set up automated workflows and triggers.</p>
                    </div>
                    <div className="dash-empty-state">
                      <span className="dash-empty-icon">⚡</span>
                      <h3>No automations yet</h3>
                      <p>Create automations to run actions when events happen in your app.</p>
                      <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>+ New Automation</button>
                    </div>
                  </div>
                )}

                {dashboardTab === 'logs' && (
                  <div className="dash-content">
                    <div className="dash-page-header">
                      <h2>Logs</h2>
                      <p className="dash-page-desc">View app activity and error logs.</p>
                    </div>
                    <div className="dash-table-card">
                      <div className="dash-table-header">
                        <span>Timestamp</span><span>Event</span><span>Status</span>
                      </div>
                      {editHistory.map(entry => (
                        <div key={entry.id} className="dash-table-row">
                          <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                          <span>{entry.summary}</span>
                          <span className={`dash-log-status dash-log-status--${entry.status}`}>{entry.status}</span>
                        </div>
                      ))}
                      {editHistory.length === 0 && (
                        <div className="dash-table-row" style={{ color: 'var(--text-muted)' }}>
                          <span style={{ fontStyle: 'italic' }}>No log entries yet</span>
                          <span />
                          <span />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {dashboardTab === 'api' && (
                  <div className="dash-content">
                    <div className="dash-page-header">
                      <h2>API</h2>
                      <p className="dash-page-desc">Access your app's API endpoints.</p>
                    </div>
                    <div className="dash-api-endpoint">
                      <div className="dash-api-method">GET</div>
                      <code className="dash-api-url">/api/apps/{generatedApp.id}</code>
                    </div>
                    <div className="dash-api-endpoint">
                      <div className="dash-api-method dash-api-method--post">POST</div>
                      <code className="dash-api-url">/api/apps/{generatedApp.id}/chat</code>
                    </div>
                    <div className="dash-api-endpoint">
                      <div className="dash-api-method dash-api-method--post">POST</div>
                      <code className="dash-api-url">/api/apps/{generatedApp.id}/refine</code>
                    </div>
                    <div className="dash-info-card" style={{ marginTop: 16 }}>
                      <div className="dash-info-label">API Key</div>
                      <div className="dash-info-value"><code>sb_{generatedApp.short_id}_••••••••</code></div>
                    </div>
                  </div>
                )}

                {dashboardTab === 'settings' && (
                  <div className="dash-content">
                    <div className="dash-page-header">
                      <h2>Settings</h2>
                      <p className="dash-page-desc">Configure your app's general settings.</p>
                    </div>
                    <div className="dash-settings-group">
                      <label className="dash-settings-label">App Name</label>
                      <input className="field-input" defaultValue={generatedApp.name} readOnly />
                    </div>
                    <div className="dash-settings-group">
                      <label className="dash-settings-label">Tagline</label>
                      <input className="field-input" defaultValue={generatedApp.tagline ?? ''} readOnly />
                    </div>
                    <div className="dash-settings-group">
                      <label className="dash-settings-label">Theme Color</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 24, height: 24, borderRadius: 6, background: generatedApp.spec.theme?.primary ?? 'var(--brand)', display: 'inline-block', border: '1px solid var(--border)' }} />
                        <code>{generatedApp.spec.theme?.primary ?? '#2563eb'}</code>
                      </div>
                    </div>
                    <div className="dash-settings-danger">
                      <h4>Danger Zone</h4>
                      <p>Permanently delete this app and all associated data.</p>
                      <button className="btn btn-sm" style={{ background: 'var(--error)', color: '#fff', borderColor: 'var(--error)' }}>Delete App</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {rightPanelMode === 'dashboard' && !generatedApp && (
            <div className="preview-empty">
              {generating ? (
                <div className="generation-loading">
                  <div className="generation-ring">
                    <svg viewBox="0 0 120 120" className="generation-ring-svg">
                      <circle className="generation-ring-track" cx="60" cy="60" r="52" fill="none" strokeWidth="6" />
                      <circle
                        className="generation-ring-fill"
                        cx="60" cy="60" r="52"
                        fill="none" strokeWidth="6"
                        strokeDasharray={`${2 * Math.PI * 52}`}
                        strokeDashoffset={`${2 * Math.PI * 52 * (1 - (pipelineStep + 1) / STEP_COUNT)}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="generation-ring-step">
                      {pipelineStep + 1}/{STEP_COUNT}
                    </span>
                  </div>
                  <p className="generation-label">
                    {STEP_LABELS[Math.min(pipelineStep, STEP_LABELS.length - 1)]}
                  </p>
                </div>
              ) : buildError && hasStartedGenerating ? (
                <div className="generation-error">
                  <div className="generation-error-icon">!</div>
                  <h3>Generation Failed</h3>
                  <p className="generation-error-message">{buildError}</p>
                  <div className="generation-error-actions">
                    <button className="btn btn-primary" onClick={retryGeneration}>Retry</button>
                    <button className="btn btn-secondary" onClick={handleNewProject}>Start Over</button>
                  </div>
                </div>
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
