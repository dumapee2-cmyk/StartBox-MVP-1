import { Link } from 'react-router-dom';
import { StartBoxLogo } from '../StartBoxLogo';

interface DashboardTopBarProps {
  appName: string;
  mode: 'preview' | 'dashboard';
  onModeChange: (mode: 'preview' | 'dashboard') => void;
  onShare: () => void;
  shareCopied: boolean;
  themeColor?: string;
}

export function DashboardTopBar({
  appName,
  mode,
  onModeChange,
  onShare,
  shareCopied,
}: DashboardTopBarProps) {
  return (
    <div className="dash-topbar">
      <div className="dash-topbar-left">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <StartBoxLogo size="sm" />
        </Link>
        <span className="dash-topbar-divider" />
        <span className="dash-topbar-appname">{appName}</span>
      </div>

      <div className="dash-topbar-center">
        <div className="dash-mode-toggle">
          <button
            className={`dash-mode-btn${mode === 'dashboard' ? ' dash-mode-btn--active' : ''}`}
            onClick={() => onModeChange('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`dash-mode-btn${mode === 'preview' ? ' dash-mode-btn--active' : ''}`}
            onClick={() => onModeChange('preview')}
          >
            Preview
          </button>
        </div>
      </div>

      <div className="dash-topbar-right">
        <button className="dash-topbar-btn" onClick={onShare}>
          {shareCopied ? 'Copied!' : 'Share'}
        </button>
      </div>
    </div>
  );
}
