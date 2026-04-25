import { Link, useLocation } from 'react-router-dom';
import { Menu, Settings } from 'lucide-react';
import { useSellerPageTitle } from '../context/SellerPageTitleContext';
import { pageTitleFromPath } from '../utils/pageTitleFromPath';
import { NomadLogo } from './NomadLogo';

/**
 * Sticky seller header: menu + brand (left), route title (center), exit demo + settings (right).
 */
export function SellerTopbar({
  demoExplore,
  headerStatusBadge,
  shopLabel,
  showShopSub,
  onOpenDrawer,
  onExitDemo,
}) {
  const { pathname } = useLocation();
  const { suffix } = useSellerPageTitle();
  const base = pageTitleFromPath(pathname);
  const pageHeading = base ? (suffix ? `${base} · ${suffix}` : base) : suffix || '';

  return (
    <header className="seller-topbar">
      <div className="seller-topbar__left">
        <button
          type="button"
          className="seller-topbar__iconbtn seller-topbar__menu"
          onClick={onOpenDrawer}
          aria-label="Open menu"
        >
          <Menu className="seller-topbar__lucide" size={22} strokeWidth={2.1} aria-hidden />
        </button>
        <div className="seller-topbar__brand">
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
      </div>
      <div className="seller-topbar__center" aria-live="polite">
        {pageHeading ? <span className="seller-topbar__page-title">{pageHeading}</span> : null}
      </div>
      <div className="seller-topbar__right">
        {demoExplore ? (
          <button
            type="button"
            className="btn btn-ghost seller-topbar__exit-demo"
            onClick={onExitDemo}
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
          >
            Exit demo
          </button>
        ) : null}
        <Link to="/settings" className="seller-topbar__gear" aria-label="Settings">
          <Settings className="seller-topbar__lucide" size={22} strokeWidth={2} aria-hidden />
        </Link>
      </div>
    </header>
  );
}
