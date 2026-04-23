import { useMemo } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearDemoExplorer, isDemoExplorer } from '../constants/demoMode';
import { useAuth } from '../hooks/useAuth';
import { useSeller } from '../hooks/useSeller';
import { logoutSeller } from '../services/logoutSeller';
import { getSellerStatusBadge } from '../services/sellerHelpers';
import { PwaInstallBanner } from './PwaInstallBanner';

const linkStyle = ({ isActive }) => ({
  fontWeight: isActive ? 600 : 400,
  color: 'var(--text)',
});

export function Layout() {
  const { user } = useAuth();
  const { seller, loading: sellerLoading } = useSeller();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isLanding = pathname === '/';
  const demoExplore = !isLanding && isDemoExplorer();
  const showSellerNav = Boolean(user) || demoExplore;

  const headerStatusBadge = useMemo(() => {
    if (!seller || sellerLoading) return null;
    return getSellerStatusBadge(seller);
  }, [seller, sellerLoading]);

  async function handleLogout() {
    await logoutSeller();
    navigate('/', { replace: true });
  }

  function handleExitDemo() {
    clearDemoExplorer();
    navigate('/', { replace: true });
  }

  return (
    <div className={`app-shell${isLanding ? ' app-shell--landing' : ''}`}>
      <header className={`app-header${isLanding ? ' app-header--landing' : ''}`}>
        {isLanding ? (
          <span className="app-header-spacer" aria-hidden />
        ) : (
          <Link to="/" className="app-brand">
            FaFo
          </Link>
        )}
        {isLanding ? (
          <Link to="/login" className="login-pill">
            <span className="login-pill-label">Login</span>
            <span className="login-pill-avatar" aria-hidden>
              N
            </span>
          </Link>
        ) : (
          <nav aria-label="Primary">
            {showSellerNav && headerStatusBadge ? (
              <>
                <span
                  className={headerStatusBadge.className}
                  title="Shop account status"
                  aria-label={`Shop status: ${headerStatusBadge.label}`}
                >
                  {headerStatusBadge.label}
                </span>
                {' · '}
              </>
            ) : null}
            <NavLink to="/" end className="muted" style={linkStyle}>
              Home
            </NavLink>
            {' · '}
            {showSellerNav ? (
              <NavLink to="/dashboard" className="muted" style={linkStyle}>
                Dashboard
              </NavLink>
            ) : null}
            {showSellerNav ? ' · ' : null}
            {showSellerNav ? (
              <NavLink to="/orders" className="muted" style={linkStyle}>
                Orders
              </NavLink>
            ) : null}
            {showSellerNav ? ' · ' : null}
            {showSellerNav ? (
              <NavLink to="/menu" className="muted" style={linkStyle}>
                Menu
              </NavLink>
            ) : null}
            {showSellerNav ? ' · ' : null}
            {showSellerNav ? (
              <NavLink to="/customers" className="muted" style={linkStyle}>
                Customers
              </NavLink>
            ) : null}
            {showSellerNav ? ' · ' : null}
            {showSellerNav ? (
              <NavLink to="/analytics" className="muted" style={linkStyle}>
                Analytics
              </NavLink>
            ) : null}
            {showSellerNav ? ' · ' : null}
            {showSellerNav ? (
              <NavLink to="/settings" className="muted" style={linkStyle}>
                Settings
              </NavLink>
            ) : null}
            {user ? ' · ' : null}
            {user ? (
              <NavLink to="/profile" className="muted" style={linkStyle}>
                Profile
              </NavLink>
            ) : null}
            {user ? ' · ' : null}
            {user ? (
              <NavLink to="/billing" className="muted" style={linkStyle}>
                Billing
              </NavLink>
            ) : null}
            {user || demoExplore ? ' · ' : null}
            {user ? (
              <button type="button" className="app-header-logout muted" onClick={handleLogout}>
                Logout
              </button>
            ) : demoExplore ? (
              <button type="button" className="app-header-logout muted" onClick={handleExitDemo}>
                Exit demo
              </button>
            ) : (
              <NavLink to="/login" className="muted" style={linkStyle}>
                Sign in
              </NavLink>
            )}
          </nav>
        )}
      </header>
      <main className={`app-main${isLanding ? ' app-main--landing' : ''}`}>
        {demoExplore ? (
          <div className="demo-mode-banner" role="status">
            Demo Mode — explore with mock data (no Firebase writes).
          </div>
        ) : null}
        {user && !isLanding && !demoExplore ? <PwaInstallBanner /> : null}
        <Outlet />
      </main>
    </div>
  );
}
