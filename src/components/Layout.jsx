import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { hasSellerCodeSession } from '../constants/shopCodeLocalSession';
import { clearDemoExplorer, isDemoExplorer } from '../constants/demoMode';
import { useAuth } from '../hooks/useAuth';
import { useSeller } from '../hooks/useSeller';
import { logoutSeller } from '../services/logoutSeller';
import { getSellerStatusBadge } from '../services/sellerHelpers';
import { NomadLogo } from './NomadLogo';
import { PwaInstallBanner } from './PwaInstallBanner';

const DRAWER_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/orders', label: 'Orders' },
  { to: '/menu', label: 'Menu' },
  { to: '/customers', label: 'Customers' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/billing', label: 'Billing' },
  { to: '/settings', label: 'Settings' },
  { to: '/profile', label: 'Profile' },
];

const drawerClass = ({ isActive }) =>
  isActive ? 'seller-drawer__link seller-drawer__link--active' : 'seller-drawer__link';

export function Layout() {
  const { user } = useAuth();
  const { seller, loading: sellerLoading } = useSeller();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isLanding = pathname === '/';
  const demoExplore = !isLanding && isDemoExplorer();
  const showSellerNav = Boolean(user) || demoExplore || hasSellerCodeSession();
  const codeOnlySession = hasSellerCodeSession() && !user;
  const [drawer, setDrawer] = useState(false);

  const headerStatusBadge = useMemo(() => {
    if (!seller || sellerLoading) return null;
    return getSellerStatusBadge(seller);
  }, [seller, sellerLoading]);

  const shopLabel = seller?.shopName?.trim() || '';
  const showShopSub = Boolean(shopLabel);

  useEffect(() => {
    if (!drawer) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawer]);

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  async function handleLogout() {
    setDrawer(false);
    await logoutSeller();
    navigate('/', { replace: true });
  }

  function handleExitDemo() {
    clearDemoExplorer();
    navigate('/', { replace: true });
  }

  if (isLanding) {
    return (
      <div className="app-shell app-shell--landing">
        <header className="app-header app-header--landing">
          <span className="app-header-spacer" aria-hidden />
          <Link to="/login" className="login-pill">
            <span className="login-pill-label">Login</span>
            <span className="login-pill-avatar" aria-hidden>
              F
            </span>
          </Link>
        </header>
        <main className="app-main app-main--landing">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell app-shell--seller">
      {showSellerNav ? (
        <>
          <header className="seller-topbar">
            <button
              type="button"
              className="seller-topbar__iconbtn seller-topbar__menu"
              onClick={() => setDrawer(true)}
              aria-label="Open menu"
            >
              <span className="seller-ico-burger" aria-hidden />
            </button>
            <div className="seller-topbar__title">
              <span className="seller-topbar__logomark">
                <NomadLogo size={34} decorative />
              </span>
              <div className="seller-topbar__brandcol">
                <div className="seller-topbar__name-row">
                  <span className="seller-topbar__product">FaFo</span>
                  {headerStatusBadge ? (
                    <span
                      className={headerStatusBadge.className}
                      title="Shop account status"
                      aria-label={`Shop status: ${headerStatusBadge.label}`}
                    >
                      {headerStatusBadge.label}
                    </span>
                  ) : null}
                </div>
                {showShopSub ? (
                  <span className="seller-topbar__shop" title={shopLabel}>
                    {shopLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <Link to="/settings" className="seller-topbar__gear" aria-label="Settings">
              <span className="seller-ico-gear" aria-hidden />
            </Link>
          </header>

          <div
            className={`seller-drawer-backdrop${drawer ? ' is-open' : ''}`}
            onClick={() => setDrawer(false)}
            onKeyDown={() => setDrawer(false)}
            role="presentation"
            aria-hidden
          />
          <aside
            className={`seller-drawer${drawer ? ' is-open' : ''}`}
            aria-label="Menu"
            aria-hidden={!drawer}
          >
            <div className="seller-drawer__head">
              <div className="seller-drawer__brand">
                <span className="seller-drawer__logomark">
                  <NomadLogo size={40} decorative />
                </span>
                <div className="seller-drawer__brand-text">
                  <span className="seller-drawer__product">FaFo</span>
                  <span className="seller-drawer__sub">Seller</span>
                </div>
              </div>
              <button
                type="button"
                className="seller-drawer__close"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
              >
                ×
              </button>
            </div>
            <nav className="seller-drawer__nav" aria-label="App sections">
              {DRAWER_LINKS.map((l) => (
                <NavLink key={l.to} to={l.to} className={drawerClass} onClick={() => setDrawer(false)}>
                  {l.label}
                </NavLink>
              ))}
            </nav>
            <div className="seller-drawer__foot">
              {user ? (
                <button type="button" className="seller-drawer__logout" onClick={handleLogout}>
                  Logout
                </button>
              ) : codeOnlySession ? (
                <button type="button" className="seller-drawer__logout" onClick={handleLogout}>
                  Exit shop
                </button>
              ) : demoExplore ? (
                <button type="button" className="seller-drawer__logout" onClick={handleExitDemo}>
                  Exit demo
                </button>
              ) : (
                <Link to="/login" className="seller-drawer__logoutlink" onClick={() => setDrawer(false)}>
                  Sign in
                </Link>
              )}
            </div>
          </aside>
        </>
      ) : (
        <header className="app-header app-header--bare">
          <Link to="/" className="app-brand">
            FaFo
          </Link>
          <Link to="/login" className="btn btn-ghost" style={{ fontSize: '0.875rem' }}>
            Sign in
          </Link>
        </header>
      )}

      <main className="app-main app-main--seller">
        {demoExplore ? (
          <div className="demo-mode-banner" role="status">
            Demo mode: sample data only. Writing to the network is off.
          </div>
        ) : null}
        {(user || hasSellerCodeSession()) && !isLanding && !demoExplore ? <PwaInstallBanner /> : null}
        <div className="app-main__scroll">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
