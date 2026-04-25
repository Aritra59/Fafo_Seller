import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { DashboardAdSection } from '../components/ads/DashboardAdSection';
import { isDemoExplorer } from '../constants/demoMode';
import { useAuth } from '../hooks/useAuth';
import { useSeller } from '../hooks/useSeller';
import { getBuyerPhone, getOrderTimeMs } from '../services/analyticsService';
import { subscribeMenuGroupsBySellerId } from '../services/menuGroupsService';
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
  TRIAL_ENDING_DAYS_THRESHOLD,
} from '../services/sellerHelpers';
import { pickScheduledMenu } from '../utils/menuSchedule';
import { normalizeShopCode } from '../utils/shopCode';
import { publicShopByCodeUrl, publicShopQrTargetUrl, publicShopShareUrl } from '../utils/publicShopUrl';

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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { seller, sellerId, loading, error, reload } = useSeller();
  const [orderRows, setOrderRows] = useState([]);
  const [productRows, setProductRows] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [menuGroupRows, setMenuGroupRows] = useState(/** @type {any[]} */ ([]));
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [sessionModal, setSessionModal] = useState(false);
  const [shareModal, setShareModal] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copyDone, setCopyDone] = useState(false);
  const demoExplore = isDemoExplorer();

  useEffect(() => {
    if (!sellerId) {
      setMenuGroupRows([]);
      return undefined;
    }
    return subscribeMenuGroupsBySellerId(
      sellerId,
      (rows) => setMenuGroupRows(rows || []),
      () => setMenuGroupRows([]),
    );
  }, [sellerId]);

  useEffect(() => {
    const id = window.setInterval(() => setClockTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const shopCodeNorm = useMemo(
    () => normalizeShopCode(seller?.shopCode ?? seller?.code ?? ''),
    [seller?.shopCode, seller?.code],
  );
  const shareLink = useMemo(() => (shopCodeNorm ? publicShopShareUrl(shopCodeNorm) : ''), [shopCodeNorm]);

  useEffect(() => {
    if (shareModal !== 'qr' || !shopCodeNorm) {
      setQrDataUrl('');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = await QRCode.toDataURL(publicShopQrTargetUrl(shopCodeNorm), {
          margin: 2,
          width: 280,
          color: { dark: '#0c0e12ff', light: '#ffffffff' },
        });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        if (!cancelled) setQrDataUrl('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareModal, shopCodeNorm]);

  const scheduledMenuNow = useMemo(
    () => pickScheduledMenu(menuGroupRows, new Date(clockTick)),
    [menuGroupRows, clockTick],
  );

  const menuSessionDisplay = useMemo(() => {
    const rowName = (gidRaw) => {
      if (gidRaw == null || String(gidRaw).trim() === '') return '';
      const gid = String(gidRaw).trim();
      const g = menuGroupRows.find((m) => String(m.id).trim() === gid);
      if (!g) return '';
      return String(g.name || g.menuName || '').trim() || 'Menu';
    };

    const oidRaw = seller?.menuSessionOverrideGroupId;
    if (oidRaw != null && String(oidRaw).trim() !== '') {
      const fromRow = rowName(oidRaw);
      if (fromRow) return fromRow;
      const saved = String(seller?.menuSession ?? '').trim();
      if (saved) return saved;
    }

    const sfRaw = seller?.storefrontMenuGroupId;
    if (sfRaw != null && String(sfRaw).trim() !== '') {
      const fromStorefront = rowName(sfRaw);
      if (fromStorefront) return fromStorefront;
    }

    if (scheduledMenuNow) {
      return String(scheduledMenuNow.name || scheduledMenuNow.menuName || '').trim() || 'Menu';
    }
    const savedFallback = String(seller?.menuSession ?? '').trim();
    if (savedFallback) return savedFallback;
    return 'All Day';
  }, [
    seller?.menuSessionOverrideGroupId,
    seller?.storefrontMenuGroupId,
    seller?.menuSession,
    menuGroupRows,
    scheduledMenuNow,
  ]);

  const hasManualMenuOverride = Boolean(seller?.menuSessionOverrideGroupId);

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
  const allowWrite = !demoExplore;

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
  const goLiveDisabled = seller?.isBlocked === true;
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
  if (lowStock > 0) alertParts.push(`${lowStock} low availability`);
  if (liveNoSlotsWarning) alertParts.push(liveNoSlotsWarning);
  if (seller?.isBlocked) alertParts.push('Account blocked');
  const alertText = alertParts.length ? alertParts.join(' · ') : 'All clear';

  async function applyMenuSessionChoice(choice) {
    if (!seller?.id || !allowWrite) return;
    if (choice === 'auto') {
      const picked = pickScheduledMenu(menuGroupRows, new Date());
      const nm = picked ? String(picked.name || picked.menuName || '').trim() : 'All Day';
      const storefrontMenuGroupId = picked?.id ? String(picked.id).trim() : null;
      await patchSeller({
        menuSessionOverrideGroupId: null,
        menuSession: nm,
        storefrontMenuGroupId,
      });
    } else if (choice && typeof choice === 'object' && choice.id) {
      const nm = String(choice.name || '').trim() || 'Menu';
      const gid = String(choice.id).trim();
      await patchSeller({
        menuSessionOverrideGroupId: gid,
        menuSession: nm,
        storefrontMenuGroupId: gid,
      });
    }
    setSessionModal(false);
    reload();
  }

  useEffect(() => {
    if (!seller?.id || demoExplore) return;
    const overrideRaw = seller.menuSessionOverrideGroupId;
    const hasOverride = overrideRaw != null && String(overrideRaw).trim() !== '';
    const nextGroupId = hasOverride
      ? String(overrideRaw).trim()
      : scheduledMenuNow?.id
        ? String(scheduledMenuNow.id).trim()
        : null;
    let nextName = 'All Day';
    if (hasOverride && nextGroupId) {
      const g = menuGroupRows.find((m) => String(m.id) === String(nextGroupId));
      const savedLabel = String(seller.menuSession ?? '').trim();
      nextName = g
        ? String(g.name || g.menuName || '').trim() || 'Menu'
        : savedLabel || 'Menu';
    } else if (scheduledMenuNow) {
      nextName = String(scheduledMenuNow.name || scheduledMenuNow.menuName || '').trim() || 'Menu';
    }
    const curRaw = seller.storefrontMenuGroupId;
    const cur = curRaw != null && String(curRaw).trim() ? String(curRaw).trim() : null;
    const curSession = String(seller.menuSession ?? '').trim();
    const patch = {};
    if (cur !== nextGroupId && (cur || nextGroupId)) {
      patch.storefrontMenuGroupId = nextGroupId ?? null;
    }
    if (curSession !== nextName) {
      patch.menuSession = nextName;
    }
    if (Object.keys(patch).length === 0) return;
    void updateSellerDocument(seller.id, patch).catch(() => {});
  }, [
    seller?.id,
    seller?.menuSessionOverrideGroupId,
    seller?.storefrontMenuGroupId,
    seller?.menuSession,
    scheduledMenuNow,
    menuGroupRows,
    clockTick,
    demoExplore,
  ]);

  async function handleCopyShopLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      /* ignore */
    }
  }

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

      {showTrialUi && !demoExplore && trialExpired && !slotsOk ? (
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
          className={`dashboard-v2-pill${hasManualMenuOverride ? ' dashboard-v2-pill--accent' : ''}`}
          onClick={() => setSessionModal(true)}
          disabled={toggleBusy || !allowWrite}
        >
          <span className="dashboard-v2-pill-label">MENU SESSION</span>
          <span className="dashboard-v2-pill-value">{menuSessionDisplay}</span>
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

      {!demoExplore && shopCodeNorm ? (
        <section className="dashboard-share card" aria-label="Share your shop">
          <h2 className="dashboard-v2-section-title" style={{ marginTop: 0 }}>
            Share menu
          </h2>
          <div className="dashboard-share__row">
            <a
              href={publicShopByCodeUrl(shopCodeNorm)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary dashboard-share__btn"
            >
              Open shop link
            </a>
            <button type="button" className="btn btn-ghost dashboard-share__btn" onClick={() => setShareModal('qr')}>
              Show QR
            </button>
            <button type="button" className="btn btn-ghost dashboard-share__btn" onClick={() => void handleCopyShopLink()}>
              {copyDone ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </section>
      ) : null}

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

      {!demoExplore ? <DashboardAdSection /> : null}

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
              {demoExplore ? '—' : ordersLoading ? '…' : `₹${revenue.today.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            </strong>
          </li>
          <li>
            <span className="muted">Top item (7d)</span>
            <strong>{demoExplore ? '—' : ordersLoading ? '…' : topItem}</strong>
          </li>
          <li>
            <span className="muted">Repeat customers (est.)</span>
            <strong>{demoExplore ? '—' : repeatPct == null ? '—' : `${repeatPct}%`}</strong>
          </li>
          <li>
            <span className="muted">Pending / alerts</span>
            <strong className={stats.pending > 0 ? 'text-warn' : undefined}>{alertText}</strong>
          </li>
          <li>
            <span className="muted">Low availability</span>
            <strong>{demoExplore ? '—' : productsLoading ? '…' : lowStock}</strong>
          </li>
        </ul>
        {!demoExplore ? (
          <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.8rem' }}>
            Status: {modeLabel}
            {user?.phoneNumber ? ` · ${user.phoneNumber}` : null}
          </p>
        ) : null}
        <div style={{ marginTop: '0.5rem' }}>
          <Link to="/analytics" className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>
            Full insights / Analytics
          </Link>
        </div>
      </section>

      {demoExplore ? (
        <section className="dashboard-demo-cta card" style={{ marginTop: '0.85rem' }} aria-label="Demo mode">
          <p className="dashboard-demo-cta__title" style={{ margin: 0, fontWeight: 700 }}>
            Demo mode
          </p>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
            Explore sample data. Nothing here connects to live billing or payouts.
          </p>
          <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={() => navigate('/login')}>
            Start selling
          </button>
        </section>
      ) : null}

      {showTrialUi && !demoExplore ? (
        <section className="dashboard-trial" aria-label="Trial status" style={{ marginTop: '0.85rem' }}>
          <div
            className={`dashboard-trial-inner${trialExpired ? ' dashboard-trial--expired' : ''}${endingSoon && trialActive ? ' dashboard-trial--warning' : ''}`}
          >
            <span className="dashboard-trial-badge">Free trial</span>
            {trialExpired ? (
              <p className="dashboard-trial-text">
                Your trial has ended. Recharge under Billing to keep accepting orders.
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

      {showTrialUi && !demoExplore ? (
        <section className="dashboard-v2-footer" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-primary" disabled={goLiveDisabled} onClick={() => navigate('/billing')}>
            Go live
          </button>
        </section>
      ) : !showTrialUi && !isLiveAccount && effective === 'demo' && !demoExplore ? (
        <section className="dashboard-v2-footer" style={{ marginTop: '1rem' }}>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Explore mode — activate from <Link to="/profile">Profile</Link> / <Link to="/billing">Billing</Link>.
          </p>
        </section>
      ) : null}

      {sessionModal ? (
        <div className="dashboard-modal-overlay" role="presentation">
          <button type="button" className="dashboard-modal-overlay__backdrop" aria-label="Close" onClick={() => setSessionModal(false)} />
          <div className="dashboard-modal card" role="dialog" aria-modal="true" aria-labelledby="dash-session-title">
            <div className="dashboard-modal__head">
              <h2 id="dash-session-title" style={{ margin: 0, fontSize: '1.05rem' }}>
                Menu session
              </h2>
              <button type="button" className="btn btn-ghost" onClick={() => setSessionModal(false)}>
                ✕
              </button>
            </div>
            <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.875rem' }}>
              Auto follows your menu schedules. Pick a menu to override until you switch back to auto.
            </p>
            <ul className="dashboard-modal__list stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: '0.5rem' }}>
              <li>
                <button type="button" className="btn btn-ghost dashboard-modal__opt" onClick={() => void applyMenuSessionChoice('auto')}>
                  Auto (schedule){scheduledMenuNow ? ` → ${String(scheduledMenuNow.name || '').trim()}` : ' → All day'}
                </button>
              </li>
              {menuGroupRows
                .filter((g) => g.active !== false && g.isActive !== false)
                .map((g) => {
                  const nm = String(g.name || g.menuName || '').trim() || 'Menu';
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        className="btn btn-ghost dashboard-modal__opt"
                        onClick={() => void applyMenuSessionChoice({ id: g.id, name: nm })}
                      >
                        {nm}
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        </div>
      ) : null}

      {shareModal === 'qr' ? (
        <div className="dashboard-modal-overlay" role="presentation">
          <button type="button" className="dashboard-modal-overlay__backdrop" aria-label="Close" onClick={() => setShareModal(null)} />
          <div className="dashboard-modal card dashboard-modal--narrow" role="dialog" aria-modal="true" aria-labelledby="dash-qr-title">
            <div className="dashboard-modal__head">
              <h2 id="dash-qr-title" style={{ margin: 0, fontSize: '1.05rem' }}>
                Shop QR
              </h2>
              <button type="button" className="btn btn-ghost" onClick={() => setShareModal(null)}>
                ✕
              </button>
            </div>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR code linking to your public shop" className="dashboard-qr-img" width={280} height={280} />
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Generating…
              </p>
            )}
            <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.8rem', wordBreak: 'break-all' }}>
              {publicShopByCodeUrl(shopCodeNorm)}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
