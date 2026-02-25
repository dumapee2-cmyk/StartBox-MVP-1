import { Link } from 'react-router-dom';
import { useRecentApps } from '../hooks/useRecentApps';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function GalleryPage() {
  const { apps, loading, error } = useRecentApps();

  return (
    <div className="gallery-page">
      <header className="full-app-topbar">
        <Link to="/" className="topbar-logo">
          <div className="topbar-logo-mark">S</div>
          <span className="topbar-logo-text">StartBox</span>
          <span className="topbar-badge">Beta</span>
        </Link>
        <div className="topbar-actions">
          <Link to="/" className="btn btn-primary btn-sm">
            New Project
          </Link>
        </div>
      </header>

      <div className="gallery-content">
        <div className="gallery-hero">
          <h1>App Gallery</h1>
          <p>Explore projects built with StartBox. Clone any project and make it your own.</p>
        </div>

        {loading && (
          <div className="gallery-loading">
            <span className="spinner spinner-lg" />
            <span>Loading apps...</span>
          </div>
        )}

        {error && (
          <div className="page-error">{error}</div>
        )}

        {!loading && !error && apps.length === 0 && (
          <div className="gallery-empty">
            <h3>No projects yet</h3>
            <p>Create your first project to get started.</p>
            <Link to="/" className="btn btn-primary">New Project</Link>
          </div>
        )}

        {!loading && apps.length > 0 && (
          <div className="gallery-grid">
            {apps.map((app) => (
              <Link
                key={app.id}
                to={`/app/${app.id}`}
                className="gallery-card"
                style={app.theme_color ? { '--card-accent': app.theme_color } as React.CSSProperties : undefined}
              >
                <div className="gallery-card-top">
                  <div
                    className="gallery-card-color-bar"
                    style={{ background: app.theme_color ?? '#6366f1' }}
                  />
                  <div className="gallery-card-icon">
                    {app.name.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div className="gallery-card-body">
                  <h3 className="gallery-card-name">{app.name}</h3>
                  {app.tagline && (
                    <p className="gallery-card-tagline">{app.tagline}</p>
                  )}
                  <div className="gallery-card-meta">
                    <span className="gallery-card-runs">
                      {app.run_count > 0 ? `${app.run_count} runs` : 'New'}
                    </span>
                    <span className="gallery-card-time">{timeAgo(app.created_at)}</span>
                  </div>
                </div>
                <div className="gallery-card-footer">
                  <span className="gallery-card-cta">Open Project</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
