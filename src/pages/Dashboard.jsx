import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardAdSection } from '../components/ads/DashboardAdSection';
import { isDemoExplorer } from '../constants/demoMode';
import { useAuth } from '../hooks/useAuth';
import { useSeller } from '../hooks/useSeller';
import { getBuyerPhone, getOrderTimeMs } from '../services/analyticsService';
import {
  subscribeOrdersBySellerId,
  subscribeProductsBySellerId,
  updateSellerDocument,
} from '../services/firestore';
import {
  canBuyersPlaceOrders,
  checkTrialStatus,
  computeRevenueTotals,
  countCompletedOrders,
  countSellerPendingOrders,
  getSellerModeLabel,
  getTrialDaysLeft,
  isShopOpenNow,
  isTrialEndingSoon,
  resolveEffectiveSellerMode,
  resolveShopOpenNow,
  TRIAL_ENDING_DAYS_THRESHOLD,
} from '../services/sellerHelpers';

const SERVING = [
  { id: 'morning', label: 'Morning' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'allday', label: 'All Day' },
];

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
    completed: countCompletedOrders(orders),
  };
}

function orderInLastMs(o, ms) {
  const t = getOrderTimeMs(o);
  if (t == null) return false;
  return t >= Date.now() - ms;
}

function computeTopItem(orders) {
  const since = 7 * 24 * 60 * 60 * 1000;
  const map = new Map();
  for (const o of orders) {
    if (!orderInLastMs(o, since)) continue;
    for (const it of o.items || []) {
      const n = String(it.name || it.title || 'Item').trim() || 'Item';
      const q = Number(it.qty);
      const add = Number.isFinite(q) && q > 0 ? q : 1;
      map.set(n, (map.get(n) || 0) + add);
    }
  }
  let best = '—';
  let max = 0;
  for (const [k, v] of map) {
    if (v > max) {
      max = v;
      best = k;
    }
  }
  return best;
}

function repeatCustomerPercent(orders) {
  const rangeMs = 30 * 24 * 60 * 60 * 1000;
  const recent = orders.filter((o) => orderInLastMs(o, rangeMs));
  const by = new Map();
  for (const o of recent) {
    const p = getBuyerPhone(o);
    if (!p) continue;
    by.set(p, (by.get(p) || 0) + 1);
  }
  let buyers = 0;
  let repeat = 0;
  for (const c of by.values()) {
    buyers += 1;
    if (c > 1) repeat += 1;
  }
  if (buyers === 0) return null;
  return Math.min(100, Math.round((repeat / buyers) * 100));
}

function lowStockCount(products) {
  if (!Array.isArray(products)) return 0;
  let n = 0;
  for (const p of products) {
    if (p.available === false) continue;
    const q = Number(p.quantity);
    if (Number.isFinite(q) && q > 0 && q < 5) n += 1;
  }
  return n;
}

export function Dashboard() {
  const { user } = useAuth();
  const { seller, sellerId, loading, error } = useSeller();
  const [orderRows, setOrderRows] = useState([]);
  const [productRows, setProductRows] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [toggleBusy, setToggleBusy] = useState(false);

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

  useEffect(() => {
    if (!sellerId) {
      setProductRows([]);
      setProductsLoading(false);
      return undefined;
    }
    setProductsLoading(true);
    return subscribeProductsBySellerId(
      sellerId,
      (rows) => {
        setProductRows(rows);
        setProductsLoading(false);
      },
      () => {
        setProductRows([]);
        setProductsLoading(false);
      },
    );
  }, [sellerId]);

  const stats = useMemo(() => computeOrderStats(orderRows), [orderRows]);
  const revenue = useMemo(() => computeRevenueTotals(orderRows), [orderRows]);
  const topItem = useMemo(() => computeTopItem(orderRows), [orderRows]);
  const repeatPct = useMemo(() => repeatCustomerPercent(orderRows), [orderRows]);
  const lowStock = useMemo(() => lowStockCount(productRows), [productRows]);

  const openEffective = seller ? isShopOpenNow(seller) : null;
  const deliveryOn = seller ? seller.deliveryEnabled !== false : true;
  const serving = String(seller?.servingWindow || 'allday')
    .trim()
    .toLowerCase();
  const servingId = ['morning', 'lunch', 'dinner', 'allday'].includes(serving) ? serving : 'allday';

  const allowWrite = !isDemoExplorer();

  const patchSeller = useCallback(
    async (fields) => {
      if (!seller?.id || !allowWrite) return;
      setToggleBusy(true);
      try {
        await updateSellerDocument(seller.id, fields);
      } catch {
        /* rules / offline */
      } finally {
        setToggleBusy(false);
      }
    },
    [seller?.id, allowWrite],
  );

  const onToggleOpen = () => {
    void patchSeller({ shopOpenManualMode: openEffective ? 'closed' : 'open' });
  };

  const onCycleServing = () => {
    const idx = SERVING.findIndex((s) => s.id === servingId);
    const next = SERVING[(idx + 1) % SERVING.length].id;
    void patchSeller({ servingWindow: next });
  };

  const onToggleDelivery = () => {
    void patchSeller({ deliveryEnabled: !deliveryOn });
  };

  const effective = seller ? resolveEffectiveSellerMode(seller) : 'demo';
  const isLiveAccount = effective === 'live';
  const showTrialUi = effective === 'freeTrial';
  const trialStatus = seller ? checkTrialStatus(seller) : 'expired';
  const daysLeft = seller ? getTrialDaysLeft(seller.trialEnd) : 0;
  const trialActive = trialStatus === 'active';
  const trialExpired = trialStatus === 'expired';
  const endingSoon = seller && showTrialUi ? isTrialEndingSoon(seller) : false;
  const goLiveDisabled = trialExpired || seller?.isBlocked === true;
  const modeLabel = seller ? getSellerModeLabel(seller) : '—';

  const slotsCount = Number(seller?.slots ?? 0);
  const slotsOk = Number.isFinite(slotsCount) && slotsCount > 0;
  const isLive = seller?.isLive === true;
  const buyersOk = seller ? canBuyersPlaceOrders(seller) : false;

  const liveNoSlotsWarning =
    isLiveAccount && !slotsOk
      ? 'No slots left — recharge in Billing.'
      : null;
  const alertParts = [];
  if (stats.pending > 0) alertParts.push(`${stats.pending} order(s) waiting`);
  if (lowStock > 0) alertParts.push(`${lowStock} low stock`);
  if (liveNoSlotsWarning) alertParts.push(liveNoSlotsWarning);
  if (seller?.isBlocked) alertParts.push('Account blocked');
  const alertText = alertParts.length ? alertParts.join(' · ') : 'All clear';

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
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>No shop linked to this sign-in</h1>
          <p className="muted" style={{ margin: 0 }}>
            If your business was set up for you, sign in with the phone or shop code we have on
            file.
          </p>
          <div className="stack" style={{ gap: '0.5rem' }}>
            <Link to="/login" className="btn btn-primary" style={{ textAlign: 'center' }}>
              Try sign-in again
            </Link>
            <Link to="/onboarding" className="btn btn-ghost" style={{ textAlign: 'center' }}>
              Create a new shop profile
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (seller.isBlocked) {
    return (
      <div className="dashboard">
        <div className="card stack">
          <p className="error" style={{ margin: 0 }}>
            This shop is blocked. Contact support.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard dashboard--v2">
      {effective === 'suspended' ? (
        <section className="dashboard-strip card" style={{ marginBottom: '0.75rem' }}>
          <p className="error" style={{ margin: 0, fontSize: '0.9375rem' }}>
            This shop is suspended. Contact support.
          </p>
        </section>
      ) : null}

      {!buyersOk && !seller.isBlocked && effective !== 'suspended' ? (
        <section className="dashboard-strip card" style={{ marginBottom: '0.75rem' }} aria-live="polite">
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            {isLiveAccount && !slotsOk
              ? 'LIVE — add menu slots and refresh billing so buyers can check out.'
              : !slotsOk
                ? 'No order slots yet — add menu and go live when ready.'
                : !isLiveAccount && !isLive
                  ? 'Shop not live — complete go-live to accept buyer orders.'
                  : 'Checkout unavailable for this shop right now.'}
          </p>
        </section>
      ) : null}

      {showTrialUi && trialExpired && !slotsOk ? (
        <section className="dashboard-strip card" style={{ marginBottom: '0.75rem' }} aria-live="polite">
          <p className="error" style={{ margin: 0, fontSize: '0.9rem' }}>
            Recharge to continue receiving orders
          </p>
        </section>
      ) : null}

      <section className="dashboard-v2-pills" aria-label="Shop controls">
        <button
          type="button"
          className={`dashboard-v2-pill${openEffective ? ' dashboard-v2-pill--on' : ' dashboard-v2-pill--off'}`}
          onClick={onToggleOpen}
          disabled={toggleBusy || !allowWrite}
        >
          <span className="dashboard-v2-pill-label">Shop status</span>
          <span className="dashboard-v2-pill-value">
            {openEffective == null
              ? '—'
              : openEffective
                ? 'OPEN'
                : 'CLOSED'}
          </span>
        </button>
        <button
          type="button"
          className="dashboard-v2-pill"
          onClick={onCycleServing}
          disabled={toggleBusy || !allowWrite}
        >
          <span className="dashboard-v2-pill-label">Menu session</span>
          <span className="dashboard-v2-pill-value">
            {SERVING.find((s) => s.id === servingId)?.label ?? 'All Day'}
          </span>
        </button>
        <button
          type="button"
          className={`dashboard-v2-pill${deliveryOn ? ' dashboard-v2-pill--on' : ' dashboard-v2-pill--off'}`}
          onClick={onToggleDelivery}
          disabled={toggleBusy || !allowWrite}
        >
          <span className="dashboard-v2-pill-label">Delivery</span>
          <span className="dashboard-v2-pill-value">{deliveryOn ? 'ACTIVE' : 'OFF'}</span>
        </button>
      </section>

      <section className="dashboard-v2-kpis" aria-label="Key metrics">
        <article className="dashboard-v2-kpi">
          <p className="dashboard-v2-kpi-value">{ordersLoading ? '…' : stats.total}</p>
          <p className="dashboard-v2-kpi-label">Total orders</p>
        </article>
        <article className="dashboard-v2-kpi">
          <p className="dashboard-v2-kpi-value">{ordersLoading ? '…' : stats.pending}</p>
          <p className="dashboard-v2-kpi-label">Pending</p>
        </article>
        <article className="dashboard-v2-kpi">
          <p className="dashboard-v2-kpi-value">{ordersLoading ? '…' : stats.completed}</p>
          <p className="dashboard-v2-kpi-label">Completed</p>
        </article>
      </section>

      <DashboardAdSection />

      <section className="dashboard-v2-links" aria-label="Quick links">
        <h2 className="dashboard-v2-section-title">Quick links</h2>
        <div className="dashboard-v2-link-row">
          <Link to="/orders" className="dashboard-v2-link-tile">
            <span>Orders</span>
          </Link>
          <Link to="/menu" className="dashboard-v2-link-tile">
            <span>Menu</span>
          </Link>
          <Link to="/customers" className="dashboard-v2-link-tile">
            <span>Customers</span>
          </Link>
        </div>
      </section>

      <section className="dashboard-v2-insights card" aria-label="Business insights">
        <h2 className="dashboard-v2-section-title" style={{ marginTop: 0 }}>
          Business insights
        </h2>
        <ul className="dashboard-v2-insight-list">
          <li>
            <span className="muted">Revenue today</span>
            <strong>
              {ordersLoading
                ? '…'
                : `₹${revenue.today.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            </strong>
          </li>
          <li>
            <span className="muted">Top item (7d)</span>
            <strong>{ordersLoading ? '…' : topItem}</strong>
          </li>
          <li>
            <span className="muted">Repeat customers (est.)</span>
            <strong>{repeatPct == null ? '—' : `${repeatPct}%`}</strong>
          </li>
          <li>
            <span className="muted">Pending / alerts</span>
            <strong className={stats.pending > 0 ? 'text-warn' : undefined}>{alertText}</strong>
          </li>
          <li>
            <span className="muted">Low stock SKUs</span>
            <strong>{productsLoading ? '…' : lowStock}</strong>
          </li>
        </ul>
        <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.8rem' }}>
          Status: {modeLabel}
          {user?.phoneNumber ? ` · ${user.phoneNumber}` : null}
        </p>
        <div style={{ marginTop: '0.5rem' }}>
          <Link to="/analytics" className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>
            Full insights / Analytics
          </Link>
        </div>
      </section>

      {showTrialUi ? (
        <section className="dashboard-trial" aria-label="Trial status" style={{ marginTop: '0.85rem' }}>
          <div
            className={`dashboard-trial-inner${trialExpired ? ' dashboard-trial--expired' : ''}${endingSoon && trialActive ? ' dashboard-trial--warning' : ''}`}
          >
            <span className="dashboard-trial-badge">Free Trial</span>
            {trialExpired ? (
              <p className="dashboard-trial-text">
                Your trial has ended. Upgrade or go live to keep using FaFo.
              </p>
            ) : (
              <p className="dashboard-trial-text">
                <strong>{daysLeft}</strong> {daysLeft === 1 ? 'day' : 'days'} left
                {endingSoon && trialActive
                  ? ` — ends within ${TRIAL_ENDING_DAYS_THRESHOLD} days.`
                  : null}
              </p>
            )}
          </div>
        </section>
      ) : null}

      <section className="dashboard-v2-footer" style={{ marginTop: '1rem' }}>
        {isLiveAccount ? (
          <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
            <strong style={{ color: 'var(--live)' }}>LIVE</strong> — manage top-ups under{' '}
            <Link to="/billing">Billing</Link>.
          </p>
        ) : null}
        {showTrialUi && trialExpired ? (
          <button type="button" className="btn btn-primary" disabled>
            Go Live
          </button>
        ) : null}
        {showTrialUi && !trialExpired ? (
          <button type="button" className="btn btn-primary" disabled={goLiveDisabled}>
            Go Live
          </button>
        ) : null}
        {!showTrialUi && !isLiveAccount && effective === 'demo' ? (
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Explore mode — activate from <Link to="/profile">Profile</Link> / <Link to="/billing">Billing</Link>.
          </p>
        ) : null}
      </section>
    </div>
  );
}
