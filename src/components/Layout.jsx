import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { hasSellerCodeSession } from '../constants/shopCodeLocalSession';
import { clearDemoExplorer, isDemoExplorer } from '../constants/demoMode';
import { useAuth } from '../hooks/useAuth';
import { useSeller } from '../hooks/useSeller';
import { logoutSeller } from '../services/logoutSeller';
import { getSellerStatusBadge } from '../services/sellerHelpers';
import { X } from 'lucide-react';
import { SellerPageTitleProvider } from '../context/SellerPageTitleContext';
import { NomadLogo } from './NomadLogo';
import { PwaInstallBanner } from './PwaInstallBanner';
import { SellerTermsGate } from './SellerTermsGate';
import { SellerTopbar } from './SellerTopbar';

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
    <SellerPageTitleProvider>
      <div className="app-shell app-shell--seller">
        {showSellerNav ? (
          <>
            <SellerTopbar
              demoExplore={demoExplore}
              headerStatusBadge={headerStatusBadge}
              shopLabel={shopLabel}
              showShopSub={showShopSub}
              onOpenDrawer={() => setDrawer(true)}
              onExitDemo={handleExitDemo}
            />

            {drawer ? (
            <div
              className="seller-drawer-backdrop is-open"
              onClick={() => setDrawer(false)}
              onKeyDown={() => setDrawer(false)}
              role="presentation"
              aria-hidden
            />
          ) : null}
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
                <X size={22} strokeWidth={2.1} aria-hidden />
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
          {(user || hasSellerCodeSession()) && !isLanding && !demoExplore ? <PwaInstallBanner /> : null}
          <SellerTermsGate>
            <div className="app-main__scroll">
              <Outlet />
            </div>
          </SellerTermsGate>
        </main>
      </div>
    </SellerPageTitleProvider>
  );
}
