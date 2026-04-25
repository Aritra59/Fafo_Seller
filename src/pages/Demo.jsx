import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { resolvePostLoginPath } from '../services/postLoginRedirect';

/**
 * Lightweight demo entry — set via Explore on the landing page.
 */
export function Demo() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const demo = sessionStorage.getItem('fafo_demo') === '1';

  return (
    <div className="card stack" style={{ maxWidth: 520, margin: '0 auto' }}>
      <p className="muted" style={{ margin: 0 }}>
        {demo
          ? 'You are exploring FaFo with mock data. Sign in when you are ready to sync a real shop.'
          : 'Use “Explore (demo mode)” on the home page for the full demo flow.'}
      </p>
      <div className="stack" style={{ gap: '0.5rem' }}>
        {user ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const path = await resolvePostLoginPath(user);
              navigate(path, { replace: true });
            }}
          >
            Continue
          </button>
        ) : (
          <Link to="/login" className="btn btn-primary" style={{ textAlign: 'center' }}>
            Sign in to sync data
          </Link>
        )}
        <Link to="/" className="btn btn-ghost" style={{ textAlign: 'center' }}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
