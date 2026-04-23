import { Navigate, useLocation } from 'react-router-dom';
import { hasSellerCodeSession } from '../constants/shopCodeLocalSession';
import { isDemoExplorer } from '../constants/demoMode';
import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const demo = isDemoExplorer();
  const codeOk = hasSellerCodeSession();

  if (loading && !demo && !codeOk) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Checking session…
        </p>
      </div>
    );
  }

  if (!user && !demo && !codeOk) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
