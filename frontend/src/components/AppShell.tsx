import type { AppSpec, RunResult } from '../lib/api';
import { ScreenRenderer } from './ScreenRenderer';

interface Props {
  spec: AppSpec;
  appId: string;
  onRun: (inputs: Record<string, string>, navId: string) => Promise<void>;
  result: RunResult | null;
  activeNavId: string;
  onNavChange: (navId: string) => void;
  loading: boolean;
  error: string | null;
  fullPage?: boolean;
  onShare?: () => void;
  shareCopied?: boolean;
}

export function AppShell({
  spec,
  appId: _appId,
  onRun,
  result,
  activeNavId,
  onNavChange,
  loading,
  error,
  fullPage = false,
  onShare,
  shareCopied = false,
}: Props) {
  const activeScreen = spec.screens.find((s) => s.nav_id === activeNavId) ?? spec.screens[0];
  const primaryColor = spec.theme.primary;

  async function handleRun(inputs: Record<string, string>) {
    await onRun(inputs, activeNavId);
  }

  return (
    <div
      className={`app-shell${fullPage ? ' app-shell-fullpage' : ''}`}
      style={{ '--app-color': primaryColor } as React.CSSProperties}
    >
      {/* ── Branded Header ── */}
      <div className="app-shell-header" style={{ background: primaryColor }}>
        <div className="app-shell-header-left">
          <div className="app-shell-icon">{spec.theme.icon}</div>
          <div className="app-shell-title-block">
            <div className="app-shell-name">{spec.name}</div>
            <div className="app-shell-tagline">{spec.tagline}</div>
          </div>
        </div>
        <div className="app-shell-header-actions">
          {onShare && (
            <button
              className={`app-shell-share-btn${shareCopied ? ' copied' : ''}`}
              onClick={onShare}
            >
              {shareCopied ? '✓ Copied!' : '↗ Share'}
            </button>
          )}
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <nav className="app-nav">
        {spec.navigation.map((nav) => (
          <button
            key={nav.id}
            className={`app-nav-tab${activeNavId === nav.id ? ' active' : ''}`}
            onClick={() => onNavChange(nav.id)}
          >
            <span className="app-nav-tab-icon">{nav.icon}</span>
            {nav.label}
          </button>
        ))}
      </nav>

      {/* ── Active Screen ── */}
      <div className="app-screen">
        <ScreenRenderer
          screen={activeScreen}
          onSubmit={handleRun}
          result={result}
          loading={loading}
          error={error}
          appColor={primaryColor}
        />
      </div>
    </div>
  );
}
