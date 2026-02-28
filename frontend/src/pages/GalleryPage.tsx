import { Link } from 'react-router-dom';
import { useRecentApps } from '../hooks/useRecentApps';
import { StartBoxLogo } from '../components/StartBoxLogo';

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
      <header className="gallery-header">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <StartBoxLogo size="sm" />
        </Link>
        <div className="gallery-header-right">
          <Link to="/" className="btn btn-primary btn-sm">
            + Build an App
          </Link>
        </div>
      </header>

      <div className="gallery-content">
        <div className="gallery-hero">
          <h1 className="gallery-hero-gradient">App Gallery</h1>
          <p>Explore AI apps built with StartBox. Clone any app and make it your own.</p>
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
            <h3>No apps yet</h3>
            <p>Be the first to build an AI app with StartBox.</p>
            <Link to="/" className="btn btn-primary">Build an App</Link>
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
                  <span className="gallery-card-cta">Open App →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
