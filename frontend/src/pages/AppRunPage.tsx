import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp';
import { useRunApp } from '../hooks/useRunApp';
import { AppShell } from '../components/AppShell';
import { AppPreview } from '../components/AppPreview';
import { DashboardTopBar } from '../components/dashboard/DashboardTopBar';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';

export function AppRunPage() {
  const { id } = useParams<{ id: string }>();
  const { app, loading: appLoading, error: appError } = useApp(id);
  const { run, result, loading: runLoading, error: runError } = useRunApp(id ?? '');
  const [mode, setMode] = useState<'preview' | 'dashboard'>('preview');
  const [activeSection, setActiveSection] = useState('overview');
  const [activeNavId, setActiveNavId] = useState<string>('');
  const [shareCopied, setShareCopied] = useState(false);

  if (appLoading) return <div className="page-loading"><span className="spinner spinner-lg" />Loading app...</div>;
  if (appError) return <div className="page-error">{appError}</div>;
  if (!app) return null;
  const safeApp = app;

  const resolvedNavId = activeNavId || safeApp.spec.navigation[0]?.id || '';

  function handleShare() {
    const url = `${window.location.origin}/share/${safeApp.short_id}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  async function handleRun(inputs: Record<string, string>, navId: string) {
    await run(inputs, navId);
  }

  return (
    <div className="dash-page">
      <DashboardTopBar
        appName={safeApp.name}
        mode={mode}
        onModeChange={setMode}
        onShare={handleShare}
        shareCopied={shareCopied}
      />

      {mode === 'preview' ? (
        <div className="dash-preview-body">
          {app.generated_code ? (
            <AppPreview code={safeApp.generated_code ?? ''} appId={safeApp.id} height="100%" />
          ) : (
            <AppShell
              spec={safeApp.spec}
              appId={safeApp.id}
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
      ) : (
        <DashboardLayout
          app={safeApp}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onShare={handleShare}
          shareCopied={shareCopied}
          onOpenApp={() => setMode('preview')}
        />
      )}
    </div>
  );
}
