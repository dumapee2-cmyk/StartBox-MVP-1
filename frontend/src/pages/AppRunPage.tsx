import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApp } from '../hooks/useApp';
import { useRunApp } from '../hooks/useRunApp';
import { AppShell } from '../components/AppShell';
import { AppPreview } from '../components/AppPreview';

export function AppRunPage() {
  const { id } = useParams<{ id: string }>();
  const { app, loading: appLoading, error: appError } = useApp(id);
  const { run, result, loading: runLoading, error: runError } = useRunApp(id ?? '');
  const [activeNavId, setActiveNavId] = useState<string>('');
  const [shareCopied, setShareCopied] = useState(false);

  if (appLoading) return <div className="page-loading"><span className="spinner spinner-lg" />Loading app...</div>;
  if (appError) return <div className="page-error">{appError}</div>;
  if (!app) return null;
  const safeApp = app; // captured for closures — TypeScript narrowing

  const resolvedNavId = activeNavId || safeApp.spec.navigation[0]?.id || '';
  const hasGeneratedCode = !!safeApp.generated_code;

  function handleNavChange(navId: string) {
    setActiveNavId(navId);
  }

  async function handleRun(inputs: Record<string, string>, navId: string) {
    await run(inputs, navId);
  }

  function handleShare() {
    const url = `${window.location.origin}/share/${safeApp.short_id}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  function handleDownload() {
    if (!safeApp.generated_code) return;
    const blob = new Blob([safeApp.generated_code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeApp.name.replace(/\s+/g, '-')}.jsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="full-app-page">
      <header className="full-app-topbar">
        <Link to="/" className="topbar-logo">
          <div className="topbar-logo-mark">⚡</div>
          <span className="topbar-logo-text">StartBox</span>
        </Link>
        <div className="topbar-actions">
          <span className="topbar-app-name">{safeApp.name}</span>
          {safeApp.run_count > 0 && (
            <span className="run-count">{safeApp.run_count} runs</span>
          )}
          {hasGeneratedCode && (
            <button className="btn btn-secondary btn-sm" onClick={handleDownload}>
              ↓ Code
            </button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleShare}
          >
            {shareCopied ? '✓ Copied!' : '🔗 Share'}
          </button>
        </div>
      </header>

      <div className="full-app-body">
        {hasGeneratedCode ? (
          <AppPreview
            code={safeApp.generated_code!}
            appId={safeApp.id}
            height="calc(100vh - 56px)"
          />
        ) : (
          <AppShell
            spec={safeApp.spec}
            appId={safeApp.id}
            onRun={handleRun}
            result={result}
            activeNavId={resolvedNavId}
            onNavChange={handleNavChange}
            loading={runLoading}
            error={runError}
            fullPage
            onShare={handleShare}
            shareCopied={shareCopied}
          />
        )}
      </div>
    </div>
  );
}
