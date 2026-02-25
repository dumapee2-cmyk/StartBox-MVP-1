import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="notfound-page">
      <div className="notfound-content">
        <div className="notfound-icon">⚡</div>
        <h1 className="notfound-code">404</h1>
        <h2 className="notfound-title">Page not found</h2>
        <p className="notfound-desc">This page doesn't exist — but your next AI app does.</p>
        <div className="notfound-actions">
          <Link to="/" className="btn btn-primary">Build an App →</Link>
          <Link to="/gallery" className="btn btn-secondary">Browse Gallery</Link>
        </div>
      </div>
    </div>
  );
}
