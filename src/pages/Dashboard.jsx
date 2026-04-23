import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSeller } from '../hooks/useSeller';
import { subscribeOrdersBySellerId } from '../services/firestore';
import {
  canBuyersPlaceOrders,
  checkTrialStatus,
  computeRevenueTotals,
  countCompletedOrders,
  countReadyOrders,
  countSellerPendingOrders,
  getSellerDisplayBalance,
  getSellerModeLabel,
  getTrialDaysLeft,
  isShopOpenNow,
  isTrialEndingSoon,
  resolveEffectiveSellerMode,
  TRIAL_ENDING_DAYS_THRESHOLD,
} from '../services/sellerHelpers';

function normalizeOrderStatus(status) {
  return String(status ?? '').trim().toLowerCase();
}

function computeOrderStats(orders) {
  let total = 0;
  for (const o of orders) {
    const s = normalizeOrderStatus(o.status);
    if (s === 'cancelled') continue;
    total += 1;
  }
  return {
    total,
    pending: countSellerPendingOrders(orders),
    ready: countReadyOrders(orders),
    completedBucket: countCompletedOrders(orders),
  };
}

export function Dashboard() {
  const { user } = useAuth();
  const { seller, sellerId, loading, error } = useSeller();
  const [orderRows, setOrderRows] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    if (!sellerId) {
      setOrderRows([]);
      setOrdersLoading(false);
      return undefined;
    }
    setOrdersLoading(true);
    const unsub = subscribeOrdersBySellerId(
      sellerId,
      (rows) => {
        setOrderRows(rows);
        setOrdersLoading(false);
      },
      () => {
        setOrderRows([]);
        setOrdersLoading(false);
      },
    );
    return () => unsub();
  }, [sellerId]);

  const stats = useMemo(() => computeOrderStats(orderRows), [orderRows]);
  const revenue = useMemo(() => computeRevenueTotals(orderRows), [orderRows]);

  const shopName = seller?.shopName?.trim() || 'Your shop';
  const profileLetter = shopName.charAt(0).toUpperCase();
  const profileLogo =
    typeof seller?.imageUrl === 'string' && seller.imageUrl.trim()
      ? seller.imageUrl.trim()
      : '';

  const effective = seller ? resolveEffectiveSellerMode(seller) : 'demo';
  const isLiveAccount = effective === 'live';
  const showTrialUi = effective === 'freeTrial';

  const trialStatus = seller ? checkTrialStatus(seller) : 'expired';
  const daysLeft = seller ? getTrialDaysLeft(seller.trialEnd) : 0;
  const trialActive = trialStatus === 'active';
  const trialExpired = trialStatus === 'expired';
  const endingSoon = seller && showTrialUi ? isTrialEndingSoon(seller) : false;

  const slotsCount = Number(seller?.slots ?? 0);
  const slotsOk = Number.isFinite(slotsCount) && slotsCount > 0;
  const isLive = seller?.isLive === true;

  const goLiveDisabled = trialExpired || seller?.isBlocked === true;
  const buyersOk = seller ? canBuyersPlaceOrders(seller) : false;
  const openNow = seller ? isShopOpenNow(seller) : null;
  const modeLabel = seller ? getSellerModeLabel(seller) : '—';
  const displayBalance = seller ? getSellerDisplayBalance(seller) : null;

  const liveNoSlotsWarning =
    isLiveAccount && !slotsOk
      ? 'No slots left. Recharge to continue receiving new orders.'
      : null;
  const trialRechargeWarning =
    showTrialUi && trialExpired && !slotsOk
      ? 'Recharge to continue receiving orders'
      : null;

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading card">
          <p className="muted" style={{ margin: 0 }}>
            Loading your shop…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="card stack">
          <p className="error" style={{ margin: 0 }}>
            {error.message ?? 'Could not load shop data.'}
          </p>
          <Link to="/" className="btn btn-ghost">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="dashboard">
        <div className="card stack">
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>No shop profile</h1>
          <p className="muted" style={{ margin: 0 }}>
            Complete onboarding to create your seller profile.
          </p>
          <Link to="/onboarding" className="btn btn-primary">
            Set up shop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-main">
          <div className="dashboard-shop-name-row">
            <h1 className="dashboard-shop-name">{shopName}</h1>
            {isLiveAccount ? (
              <span className="dashboard-live-pill" title="Live account">
                LIVE
              </span>
            ) : null}
          </div>
          <p className="dashboard-owner muted" style={{ margin: 0 }}>
            {seller.ownerName ? `Owner · ${seller.ownerName}` : null}
          </p>
          <p className="dashboard-slots muted" style={{ margin: '0.35rem 0 0', fontSize: '0.875rem' }}>
            Available slots:{' '}
            <strong style={{ color: 'var(--text)' }}>{Number.isFinite(slotsCount) ? slotsCount : 0}</strong>
            {!isLiveAccount && !isLive ? (
              <span>
                {' '}
                · Shop not live
              </span>
            ) : null}
            {openNow === true ? (
              <span>
                {' '}
                · <strong style={{ color: 'var(--live)' }}>Open now</strong> (hours)
              </span>
            ) : openNow === false ? (
              <span>
                {' '}
                · Closed now (hours)
              </span>
            ) : null}
            {buyersOk ? (
              <span>
                {' '}
                · Buyers can place orders
              </span>
            ) : (
              <span>
                {' '}
                ·{' '}
                {isLiveAccount
                  ? 'Buyer checkout needs slots and balance — recharge or add menu items.'
                  : showTrialUi
                    ? 'Trial active — buyers can order during trial.'
                    : 'Buyer checkout needs an active trial, or go live with slots.'}
              </span>
            )}
          </p>
        </div>
        <Link
          to="/profile"
          className="dashboard-profile"
          aria-label="Shop profile"
          title="Shop profile"
        >
          <span className="dashboard-profile-avatar" aria-hidden>
            {profileLogo ? (
              <img src={profileLogo} alt="" loading="lazy" />
            ) : (
              profileLetter
            )}
          </span>
        </Link>
      </header>

      {showTrialUi ? (
        <section
          className={`dashboard-trial${trialExpired ? ' dashboard-trial--expired' : ''}${endingSoon && trialActive ? ' dashboard-trial--warning' : ''}`}
          aria-label="Trial status"
        >
          <div className="dashboard-trial-inner">
            <span className="dashboard-trial-badge">Free Trial</span>
            {trialExpired ? (
              <p className="dashboard-trial-text">
                Your trial has ended. Upgrade or go live to keep using FaFo.
              </p>
            ) : (
              <p className="dashboard-trial-text">
                <strong>{daysLeft}</strong>{' '}
                {daysLeft === 1 ? 'day' : 'days'} left
                {endingSoon && trialActive
                  ? ` · Ends within ${TRIAL_ENDING_DAYS_THRESHOLD} days — plan ahead.`
                  : null}
              </p>
            )}
          </div>
        </section>
      ) : null}

      {liveNoSlotsWarning ? (
        <section className="dashboard-slots-banner card" aria-live="polite">
          <p className="error" style={{ margin: 0, fontSize: '0.9375rem' }}>
            {liveNoSlotsWarning}
          </p>
        </section>
      ) : null}

      {trialRechargeWarning ? (
        <section className="dashboard-slots-banner card" aria-live="polite">
          <p className="error" style={{ margin: 0, fontSize: '0.9375rem' }}>
            {trialRechargeWarning}
          </p>
        </section>
      ) : null}

      {!buyersOk && !seller?.isBlocked && effective !== 'suspended' ? (
        <section className="dashboard-slots-banner card" aria-live="polite">
          <p className="muted" style={{ margin: 0, fontSize: '0.9375rem' }}>
            {isLiveAccount && !slotsOk ? (
              <>
                LIVE account — add menu slots (products / combos / menus) and refresh billing so
                buyers can check out again.
              </>
            ) : !slotsOk ? (
              <>
                No order slots — buyers cannot check out until you add slots and go live. Your
                seller tools (menu, walk-in orders, settings) stay available.
              </>
            ) : !isLiveAccount && !isLive ? (
              <>
                Shop is not live yet — buyers cannot place orders. Complete go-live when you are
                ready.
              </>
            ) : (
              <>Buyer checkout is currently unavailable for this shop.</>
            )}
          </p>
        </section>
      ) : null}

      {effective === 'suspended' ? (
        <section className="dashboard-slots-banner card" aria-live="polite">
          <p className="error" style={{ margin: 0, fontSize: '0.9375rem' }}>
            This shop is suspended. Contact support.
          </p>
        </section>
      ) : null}

      <section className="dashboard-stats" aria-label="Overview">
        <article className="dashboard-stat-card">
          <p className="dashboard-stat-value">
            {ordersLoading ? '…' : stats.total}
          </p>
          <p className="dashboard-stat-label">Total orders</p>
        </article>
        <article className="dashboard-stat-card">
          <p className="dashboard-stat-value">
            {ordersLoading ? '…' : stats.pending}
          </p>
          <p className="dashboard-stat-label">Pending</p>
        </article>
        <article className="dashboard-stat-card">
          <p className="dashboard-stat-value">
            {ordersLoading ? '…' : stats.ready}
          </p>
          <p className="dashboard-stat-label">Ready</p>
        </article>
        <article className="dashboard-stat-card">
          <p className="dashboard-stat-value">
            {ordersLoading ? '…' : stats.completedBucket}
          </p>
          <p className="dashboard-stat-label">Completed</p>
        </article>
        <article className="dashboard-stat-card">
          <p className="dashboard-stat-value">
            {ordersLoading
              ? '…'
              : `₹${revenue.today.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          </p>
          <p className="dashboard-stat-label">Revenue today</p>
        </article>
        <article className="dashboard-stat-card">
          <p className="dashboard-stat-value">
            {ordersLoading
              ? '…'
              : `₹${revenue.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          </p>
          <p className="dashboard-stat-label">Revenue total</p>
        </article>
        <article className="dashboard-stat-card">
          <p className="dashboard-stat-value">
            {Number.isFinite(slotsCount) ? slotsCount : 0}
          </p>
          <p className="dashboard-stat-label">Slots</p>
        </article>
        {isLiveAccount ? (
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-value">
              {displayBalance != null
                ? `₹${displayBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                : '—'}
            </p>
            <p className="dashboard-stat-label">Balance</p>
          </article>
        ) : (
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-value">{showTrialUi && trialActive ? daysLeft : '—'}</p>
            <p className="dashboard-stat-label">Trial days left</p>
          </article>
        )}
        <article className="dashboard-stat-card">
          <p className="dashboard-stat-value" style={{ fontSize: '1rem' }}>
            {modeLabel}
          </p>
          <p className="dashboard-stat-label">Status</p>
        </article>
      </section>

      <section className="dashboard-sections" aria-label="Manage">
        <h2 className="dashboard-section-title">Quick links</h2>
        <div className="dashboard-link-grid">
          <Link to="/orders" className="dashboard-link-card">
            <span className="dashboard-link-card-title">Orders</span>
            <span className="muted dashboard-link-card-desc">
              View and manage incoming orders
            </span>
          </Link>
          <Link to="/menu" className="dashboard-link-card">
            <span className="dashboard-link-card-title">Menu</span>
            <span className="muted dashboard-link-card-desc">
              Items, prices, and availability
            </span>
          </Link>
          <Link to="/customers" className="dashboard-link-card">
            <span className="dashboard-link-card-title">Customers</span>
            <span className="muted dashboard-link-card-desc">
              Repeat buyers from order history
            </span>
          </Link>
          <Link to="/analytics" className="dashboard-link-card">
            <span className="dashboard-link-card-title">Insights / Analytics</span>
            <span className="muted dashboard-link-card-desc">
              KPIs, trends, menu and customer signals
            </span>
          </Link>
          <Link to="/settings" className="dashboard-link-card">
            <span className="dashboard-link-card-title">Settings</span>
            <span className="muted dashboard-link-card-desc">
              Shop hours, UPI, public shop link, templates
            </span>
          </Link>
        </div>
      </section>

      <footer className="dashboard-cta">
        {seller?.isBlocked ? (
          <p className="error" style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem' }}>
            This shop is blocked. Contact support.
          </p>
        ) : null}
        {isLiveAccount ? (
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem' }}>
            You are on a <strong style={{ color: 'var(--live)' }}>LIVE</strong> account. Manage
            top-ups under <Link to="/billing">Billing</Link>.
          </p>
        ) : null}
        {showTrialUi && trialExpired ? (
          <>
            <p className="dashboard-cta-warning error" style={{ margin: '0 0 0.75rem' }}>
              Trial expired — renew or contact support to restore full access.
            </p>
            <button type="button" className="btn btn-primary" disabled>
              Go Live
            </button>
          </>
        ) : null}
        {showTrialUi && !trialExpired && endingSoon ? (
          <>
            <p
              className="dashboard-cta-warning"
              style={{
                margin: '0 0 0.75rem',
                color: 'var(--gold)',
                fontSize: '0.9375rem',
              }}
            >
              Your trial is ending soon ({daysLeft}{' '}
              {daysLeft === 1 ? 'day' : 'days'} left). Go live before it expires.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={goLiveDisabled}
            >
              Go Live
            </button>
          </>
        ) : null}
        {showTrialUi && !trialExpired && !endingSoon ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={goLiveDisabled}
          >
            Go Live
          </button>
        ) : null}
        {!showTrialUi && !isLiveAccount && effective === 'demo' ? (
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem' }}>
            Explore mode — activate trial or go live from{' '}
            <Link to="/profile">Profile</Link> / <Link to="/billing">Billing</Link> when ready.
          </p>
        ) : null}
        {user?.phoneNumber ? (
          <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.8125rem' }}>
            Signed in as {user.phoneNumber}
          </p>
        ) : null}
      </footer>
    </div>
  );
}
