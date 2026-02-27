import { useState } from 'react';
import { ExternalLink, Copy, Check, Users, Eye, Award } from 'lucide-react';
import type { AppRecord } from '../../../lib/api';

interface OverviewSectionProps {
  app: AppRecord;
  onShare: () => void;
  shareCopied: boolean;
  onOpenApp?: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function OverviewSection({ app, onShare, shareCopied, onOpenApp }: OverviewSectionProps) {
  const [linkCopied, setLinkCopied] = useState(false);
  const shareUrl = `${window.location.origin}/share/${app.short_id}`;

  function handleCopyLink() {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  return (
    <div className="dash-overview">
      <div className="dash-overview-header">
        <div className="dash-overview-title-row">
          <h1 className="dash-overview-name">{app.name}</h1>
        </div>
        {app.tagline && <p className="dash-overview-tagline">{app.tagline}</p>}
        {app.description && <p className="dash-overview-desc">{app.description}</p>}
        <p className="dash-overview-meta">Created {formatDate(app.created_at)} ({timeAgo(app.created_at)})</p>
      </div>

      <div className="dash-overview-actions">
        {onOpenApp && (
          <button className="dash-btn dash-btn--primary" onClick={onOpenApp}>
            <ExternalLink size={16} strokeWidth={1.5} />
            Open App
          </button>
        )}
        <button className="dash-btn dash-btn--secondary" onClick={onShare}>
          <Copy size={16} strokeWidth={1.5} />
          {shareCopied ? 'Copied!' : 'Share App'}
        </button>
      </div>

      <div className="dash-overview-cards">
        <div className="dash-card">
          <div className="dash-card-header">
            <Eye size={18} strokeWidth={1.5} />
            <span>App Visibility</span>
          </div>
          <div className="dash-card-body">
            <p className="dash-card-text">Control who can access your application</p>
            <div className="dash-visibility-row">
              <span className="dash-visibility-label">Public</span>
              <div className="dash-toggle-switch dash-toggle-switch--on">
                <div className="dash-toggle-knob" />
              </div>
            </div>
            <div className="dash-link-row">
              <input
                className="dash-link-input"
                value={shareUrl}
                readOnly
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button className="dash-link-copy" onClick={handleCopyLink}>
                {linkCopied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-header">
            <Users size={18} strokeWidth={1.5} />
            <span>Invite Users</span>
          </div>
          <div className="dash-card-body">
            <p className="dash-card-text">Grow your user base by inviting others</p>
            <div className="dash-invite-row">
              <input
                className="dash-invite-input"
                placeholder="Enter email address"
                disabled
              />
              <button className="dash-btn dash-btn--primary dash-btn--sm" disabled>
                Send Invites
              </button>
            </div>
            <p className="dash-card-hint">Invite system coming soon</p>
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-header">
            <Award size={18} strokeWidth={1.5} />
            <span>Platform Badge</span>
          </div>
          <div className="dash-card-body">
            <p className="dash-card-text">The "Built with StartBox" badge is visible on your app.</p>
            <div className="dash-badge-preview">
              Built with StartBox
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
