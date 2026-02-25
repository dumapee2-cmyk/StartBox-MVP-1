import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="notfound-page">
      <div className="notfound-content">
        <h1 className="notfound-code">404</h1>
        <h2 className="notfound-title">Page not found</h2>
        <p className="notfound-desc">The page you're looking for doesn't exist.</p>
        <div className="notfound-actions">
          <Link to="/" className="btn btn-primary">Go Home</Link>
          <Link to="/gallery" className="btn btn-secondary">Browse Gallery</Link>
        </div>
      </div>
    </div>
  );
}
