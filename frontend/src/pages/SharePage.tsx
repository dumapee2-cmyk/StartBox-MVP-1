import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp';
import { useRunApp } from '../hooks/useRunApp';
import { AppShell } from '../components/AppShell';
import { AppPreview } from '../components/AppPreview';
import { api } from '../lib/api';

export function SharePage() {
  const { shortId } = useParams<{ shortId: string }>();
  const { app, loading: appLoading, error: appError } = useApp(shortId, true);
  const { run, result, loading: runLoading, error: runError } = useRunApp(app?.id ?? '');
  const [activeNavId, setActiveNavId] = useState<string>('');
  const [shareCopied, setShareCopied] = useState(false);
  const [forking, setForking] = useState(false);
  const navigate = useNavigate();

  if (appLoading) return <div className="page-loading"><span className="spinner spinner-lg" />Loading app...</div>;
  if (appError) return <div className="page-error">{appError}</div>;
  if (!app) return null;

  const resolvedNavId = activeNavId || app.spec.navigation[0]?.id || '';
  const hasGeneratedCode = !!app.generated_code;

  async function handleRun(inputs: Record<string, string>, navId: string) {
    await run(inputs, navId);
  }

  function handleShare() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).catch(() => {});
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  async function handleFork() {
    if (!app || forking) return;
    setForking(true);
    try {
      const forked = await api.forkApp(app.id);
      navigate(`/app/${forked.id}`);
    } catch {
      setForking(false);
    }
  }

  return (
    <div className="full-app-page">
      <header className="full-app-topbar">
        <Link to="/" className="topbar-logo">
          <div className="topbar-logo-mark">S</div>
          <span className="topbar-logo-text">StartBox</span>
          <span className="topbar-badge">Beta</span>
        </Link>
        <div className="topbar-actions">
          <span className="topbar-badge">Shared</span>
          <span className="topbar-app-name">{app.name}</span>
          {app.run_count > 0 && (
            <span className="run-count">{app.run_count} runs</span>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleShare}
          >
            {shareCopied ? 'Copied' : 'Share'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleFork}
            disabled={forking}
          >
            {forking ? 'Duplicating...' : 'Duplicate'}
          </button>
        </div>
      </header>

      <div className="full-app-body">
        {hasGeneratedCode ? (
          <AppPreview
            code={app.generated_code!}
            appId={app.id}
            height="calc(100vh - 56px)"
          />
        ) : (
          <AppShell
            spec={app.spec}
            appId={app.id}
            onRun={handleRun}
            result={result}
            activeNavId={resolvedNavId}
            onNavChange={setActiveNavId}
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
