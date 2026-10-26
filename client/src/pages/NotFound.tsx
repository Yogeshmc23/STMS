import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Not found');
  return (
    <main className="auth-page">
      <div className="card auth-card" style={{ textAlign: 'center' }}>
        <h1>404</h1>
        <p className="text-muted">That page doesn’t exist.</p>
        <Link to="/" className="btn btn-primary" style={{ alignSelf: 'center' }}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
