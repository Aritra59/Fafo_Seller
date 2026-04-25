import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isDemoExplorer } from '../constants/demoMode';
import { useRegisterPageTitleSuffix } from '../context/SellerPageTitleContext';
import { useSeller } from '../hooks/useSeller';
import {
  FAFO_BILLING_SUPPORT_WA,
  FAFO_BILLING_WA_PREFILL,
  FAFO_PLATFORM_UPI,
} from '../constants/billing';
import {
  createBillingIntent,
  recomputeSellerSlotCount,
  subscribeBillingBySellerId,
  subscribeGlobalAppSettings,
  subscribeOrdersBySellerId,
} from '../services/firestore';
import {
  billingBalanceWarning,
  checkTrialStatus,
  getSellerDisplayBalance,
  resolveEffectiveSellerMode,
} from '../services/sellerHelpers';
import { buildUpiPayUrl } from '../services/upi';
import {
  billingRowMillis,
  computeDailyRunningCostFromBilling,
  hasApprovedRechargeInBilling,
  isBillingUsageOrDeductionRow,
} from '../utils/billingRechargeMetrics';

/** Preset amounts (manual path) — matches seller recharge grid layout. */
const NORMAL_QUICK_AMOUNTS = [99, 249, 499, 799, 999, 4999];

function whatsappHref(phoneE164, body) {
  const digits = String(phoneE164 ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const q = body ? `?text=${encodeURIComponent(body)}` : '';
  return `https://wa.me/${digits}${q}`;
}

function sumApprovedRecharge(rows) {
  let n = 0;
  for (const r of rows) {
    const st = String(r.status ?? '').toLowerCase();
    if (st !== 'approved' && st !== 'completed') continue;
    if (isBillingUsageOrDeductionRow(r)) continue;
    const amt = Number(r.amount);
    if (Number.isFinite(amt) && amt > 0) n += amt;
  }
  return n;
}

function formatInr(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

const ORDER_GMV_ROLLING_MS = 30 * 24 * 60 * 60 * 1000;

function orderRowMillis(order) {
  const c = order?.createdAt;
  if (c && typeof c.toMillis === 'function') return c.toMillis();
  if (c && typeof c.seconds === 'number') return c.seconds * 1000;
  return 0;
}

function orderTotalAmount(order) {
  const v = order?.totalAmount ?? order?.total ?? order?.amount;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function orderStatusNorm(order) {
  return String(order?.status ?? '')
    .toLowerCase()
    .trim();
}

/** Orders the seller has confirmed (POS “Confirmed”) — order value counts toward the fee part of daily cost. */
function isOrderConfirmedForDailyCost(order) {
  return orderStatusNorm(order) === 'confirmed';
}

function sumRecentConfirmedOrderGmv(orders, nowMs) {
  const start = nowMs - ORDER_GMV_ROLLING_MS;
  let sum = 0;
  for (const o of orders) {
    if (!isOrderConfirmedForDailyCost(o)) continue;
    const ts = orderRowMillis(o);
    if (ts > 0 && ts < start) continue;
    sum += orderTotalAmount(o);
  }
  return sum;
}

function billingHealthStatus(balanceWarn) {
  const w = String(balanceWarn ?? '');
  if (w === 'exhausted') return 'empty';
  if (w === 'urgent' || w === 'low') return 'low';
  return 'healthy';
}

function isRechargeHistoryRow(row) {
  if (isBillingUsageOrDeductionRow(row)) return false;
  const amt = Number(row.amount);
  return Number.isFinite(amt) && amt > 0;
}

function normalizedRechargeHistoryStatus(row) {
  const st = String(row.status ?? '').toLowerCase();
  if (st === 'approved' || st === 'completed') return 'Approved';
  if (st === 'rejected' || st === 'declined' || st === 'failed') return 'Rejected';
  return 'Pending';
}

function formatHistoryWhen(row) {
  const ms = billingRowMillis(row);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function billingIntroCopy(seller, effective) {
  if (effective === 'live') {
    return seller?.hasLiveHistory
      ? 'Re-Charge & Continue Selling — top up balance and keep slots so buyers can keep ordering.'
      : 'Charge & Go Live — you are on a live account. Use packages below to add balance.';
  }
  if (effective === 'freeTrial') {
    const ta = seller ? checkTrialStatus(seller) === 'active' : false;
    return ta
      ? 'Free trial — fees use admin rates below; recharge before trial ends to avoid buyer checkout interruption.'
      : 'Trial ended — go live or renew to continue with production billing.';
  }
  if (effective === 'demo') {
    return 'Demo — explore the app; connect a real shop for production billing.';
  }
  if (effective === 'suspended') {
    return 'This shop is suspended. Contact support before making payments.';
  }
  if (effective === 'blocked') {
    return 'This shop is blocked. Contact support.';
  }
  return 'Manage your balance with UPI recharge and keep selling.';
}

export function PlansBilling() {
  const { seller, sellerId, loading, error, reload } = useSeller();
  const [settings, setSettings] = useState({
    slotRatePerDay: 2,
    orderFeePercent: 2,
    trialDays: 15,
  });
  const [billingRows, setBillingRows] = useState([]);
  const [billingViewTab, setBillingViewTab] = useState('recharge');
  const [presetAmount, setPresetAmount] = useState(null);
  /** `preset` = quick tile; `customDays` = days × average daily usage */
  const [amountSource, setAmountSource] = useState('preset');
  const [customRechargeDaysStr, setCustomRechargeDaysStr] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const [lastIntentId, setLastIntentId] = useState(null);
  const [lastPaidAmount, setLastPaidAmount] = useState(null);
  const [slotBusy, setSlotBusy] = useState(false);
  const [orders, setOrders] = useState([]);

  const demoExplore = isDemoExplorer();
  useRegisterPageTitleSuffix(billingViewTab === 'recharge' ? 'Recharge' : 'History');

  useEffect(() => {
    const unsub = subscribeGlobalAppSettings(
      (s) => setSettings(s),
      () => {},
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!sellerId) {
      setBillingRows([]);
      return undefined;
    }
    const unsub = subscribeBillingBySellerId(
      sellerId,
      (rows) => setBillingRows(rows),
      () => setBillingRows([]),
    );
    return () => unsub();
  }, [sellerId]);

  useEffect(() => {
    if (!sellerId) {
      setOrders([]);
      return undefined;
    }
    return subscribeOrdersBySellerId(
      sellerId,
      (rows) => setOrders(Array.isArray(rows) ? rows : []),
      () => setOrders([]),
    );
  }, [sellerId]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        reload();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reload]);

  const approvedFromBilling = useMemo(
    () => sumApprovedRecharge(billingRows),
    [billingRows],
  );

  const approvedRecharge =
    Number(seller?.approvedRechargeTotal) > 0
      ? Number(seller.approvedRechargeTotal)
      : approvedFromBilling;

  const usageTotal = Number(seller?.usageTotal ?? 0);
  const displayBal = getSellerDisplayBalance(seller);
  const balance =
    displayBal != null
      ? displayBal
      : Number(seller?.balance) === Number(seller?.balance) && seller?.balance != null
        ? Number(seller.balance)
        : approvedRecharge - usageTotal;

  const warn = billingBalanceWarning(balance);

  const slotRate = settings.slotRatePerDay;
  const feePct = settings.orderFeePercent;
  const totalSlots = Number(seller?.slots ?? 0);
  const dailySlotFee = (Number.isFinite(totalSlots) ? totalSlots : 0) * slotRate;
  const avgOrderHint = Number(seller?.averageDailyUsage ?? 0);
  const dailyOrderFee = avgOrderHint > 0 ? avgOrderHint * (feePct / 100) : 0;
  const dailyUsageEst = dailySlotFee + dailyOrderFee;

  /** Slot fee (per day) + order fee % on rolling 30-day GMV of confirmed orders, averaged per day. */
  const dailyCostSlotsAndOrders = useMemo(() => {
    const now = Date.now();
    const gmv30 = sumRecentConfirmedOrderGmv(orders, now);
    const avgDailyOrderValue = gmv30 / 30;
    const orderFeePart = avgDailyOrderValue * (feePct / 100);
    const v = dailySlotFee + orderFeePart;
    return Math.round(v * 100) / 100;
  }, [orders, dailySlotFee, feePct]);

  const upiId = FAFO_PLATFORM_UPI;
  const payeeName = 'FaFo';
  const supportWa = FAFO_BILLING_SUPPORT_WA;
  const effective = seller ? resolveEffectiveSellerMode(seller) : 'demo';
  const isLiveAccount = effective === 'live';
  const showTrialCopy = effective === 'freeTrial';

  const actionsLocked = !termsAccepted;

  const avgUsage = Number(seller?.averageDailyUsage);
  const avgUsageOk = Number.isFinite(avgUsage) && avgUsage >= 0;

  const hasPriorRecharge = useMemo(() => {
    if (approvedRecharge > 0) return true;
    if (Number(seller?.approvedRechargeTotal ?? 0) > 0) return true;
    return hasApprovedRechargeInBilling(billingRows);
  }, [approvedRecharge, seller?.approvedRechargeTotal, billingRows]);

  const smartMetrics = useMemo(
    () => computeDailyRunningCostFromBilling(billingRows),
    [billingRows],
  );

  const showSmartRecharge = Boolean(hasPriorRecharge && smartMetrics);

  /** Billing-based average after first recharge + usage; else slots + confirmed orders (30-day). */
  const effectiveAvgDaily = useMemo(() => {
    if (showSmartRecharge && smartMetrics && smartMetrics.avgDaily > 0) {
      return smartMetrics.avgDaily;
    }
    return dailyCostSlotsAndOrders;
  }, [showSmartRecharge, smartMetrics, dailyCostSlotsAndOrders]);

  const avgDailyFromBilling = Boolean(
    showSmartRecharge && smartMetrics && smartMetrics.avgDaily > 0,
  );

  const suggested30DayRecharge = useMemo(() => {
    if (!(effectiveAvgDaily > 0)) return null;
    return Math.round(effectiveAvgDaily * 30 * 100) / 100;
  }, [effectiveAvgDaily]);

  const daysLeft = useMemo(() => {
    if (!(effectiveAvgDaily > 0)) return null;
    const d = balance / effectiveAvgDaily;
    if (!Number.isFinite(d) || d < 0) return null;
    return Math.floor(d);
  }, [balance, effectiveAvgDaily]);

  const customRechargeDaysParsed = useMemo(() => {
    const n = parseInt(String(customRechargeDaysStr).trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 366) return null;
    return n;
  }, [customRechargeDaysStr]);

  const customDaysRupees = useMemo(() => {
    if (customRechargeDaysParsed == null || !(effectiveAvgDaily > 0)) return null;
    const v = Math.round(effectiveAvgDaily * customRechargeDaysParsed * 100) / 100;
    if (!Number.isFinite(v) || v < 1) return null;
    return v;
  }, [customRechargeDaysParsed, effectiveAvgDaily]);

  const rechargeHistoryRows = useMemo(
    () =>
      [...billingRows].filter(isRechargeHistoryRow).sort((a, b) => billingRowMillis(b) - billingRowMillis(a)),
    [billingRows],
  );

  const payAmount = useMemo(() => {
    if (amountSource === 'customDays' && customDaysRupees != null) {
      return customDaysRupees;
    }
    if (amountSource === 'preset' && presetAmount != null) {
      const p = Number(presetAmount);
      if (Number.isFinite(p) && p >= 1) return Math.round(p * 100) / 100;
    }
    return null;
  }, [amountSource, customDaysRupees, presetAmount]);

  function pickQuickAmount(n) {
    setAmountSource('preset');
    setPresetAmount(n);
    setCustomRechargeDaysStr('');
    setLastIntentId(null);
    setPayError('');
  }

  async function handleRefreshSlots() {
    if (!sellerId) return;
    setSlotBusy(true);
    try {
      await recomputeSellerSlotCount(sellerId);
      reload();
    } catch (e) {
      setPayError(e.message ?? 'Could not refresh slots.');
    } finally {
      setSlotBusy(false);
    }
  }

  async function handleCopyUpi() {
    if (actionsLocked || !upiId) return;
    setCopyDone(false);
    try {
      await navigator.clipboard.writeText(upiId);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    } catch {
      setPayError('Could not copy. Copy the UPI ID manually.');
    }
  }

  async function handlePayViaUpi() {
    if (!seller?.id || actionsLocked) return;
    const amt = payAmount;
    if (amt == null) {
      setPayError(
        'Pick a fixed package, or enter valid days (1–366) for a days-based top-up when daily usage is available.',
      );
      return;
    }
    setPayError('');
    setPayBusy(true);
    try {
      const id = await createBillingIntent({
        sellerId: seller.id,
        amount: amt,
      });
      setLastIntentId(id);
      setLastPaidAmount(amt);
      const href = buildUpiPayUrl({
        pa: upiId,
        pn: payeeName,
        am: String(amt),
      });
      if (href) {
        window.location.assign(href);
      }
    } catch (err) {
      setPayError(err.message ?? 'Could not save billing request.');
    } finally {
      setPayBusy(false);
    }
  }

  const proofBody =
    payAmount != null && seller
      ? `Hello I paid ₹${payAmount.toLocaleString('en-IN')}\nSeller ID: ${seller.id}\nShop: ${String(seller.shopName ?? '').trim() || seller.shopCode || '—'}`
      : '';

  const waProofUrl = whatsappHref(supportWa, proofBody);
  const waSupportUrl = whatsappHref(supportWa, FAFO_BILLING_WA_PREFILL);

  if (loading) {
    return (
      <div className="plans-billing card">
        <p className="muted" style={{ margin: 0 }}>
          Loading…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="plans-billing card stack">
        <p className="error" style={{ margin: 0 }}>
          {error.message ?? 'Something went wrong.'}
        </p>
        <Link to="/" className="btn btn-ghost">
          Home
        </Link>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="plans-billing card stack">
        <p className="muted" style={{ margin: 0 }}>
          Set up your shop first to choose a package.
        </p>
        <Link to="/onboarding" className="btn btn-primary">
          Set up shop
        </Link>
      </div>
    );
  }

  const displayPayAmount = lastPaidAmount != null ? lastPaidAmount : payAmount;
  const upiHref =
    upiId && displayPayAmount != null
      ? buildUpiPayUrl({
          pa: upiId,
          pn: payeeName,
          am: String(displayPayAmount),
        })
      : '';

  return (
    <div className="plans-billing">
      <div
        className="plans-billing-view-tabs menu-page-tabs menu-page-tabs--segmented"
        role="tablist"
        aria-label="Billing sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={billingViewTab === 'recharge'}
          className={`menu-page-tab${billingViewTab === 'recharge' ? ' menu-page-tab--active' : ''}`}
          onClick={() => setBillingViewTab('recharge')}
        >
          Recharge
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={billingViewTab === 'history'}
          className={`menu-page-tab${billingViewTab === 'history' ? ' menu-page-tab--active' : ''}`}
          onClick={() => setBillingViewTab('history')}
        >
          History
        </button>
      </div>

      <fieldset className="fieldset-reset" disabled={demoExplore}>
      {billingViewTab === 'history' ? (
        <section className="card stack plans-billing-section" aria-label="Recharge history">
          <h2 className="plans-billing-section-title">Recharge history</h2>
          {lastIntentId && displayPayAmount != null ? (
            <section
              className="card stack plans-billing-pay-ui"
              style={{ marginBottom: '1rem' }}
              aria-label="UPI payment instructions"
            >
              <p className="plans-billing-pay-ui-title">Billing request saved</p>
              <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
                Amount <strong>₹{formatInr(displayPayAmount)}</strong> · Status{' '}
                <strong>pending</strong>
              </p>
              <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>
                Ref: <code className="plans-billing-code">{lastIntentId}</code>
              </p>
              <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
                Pay to UPI ID <code className="plans-billing-code">{upiId}</code> from any UPI app.
              </p>
              {upiHref ? (
                <a className="btn btn-ghost" href={upiHref}>
                  Open UPI app
                </a>
              ) : null}
            </section>
          ) : null}
          {rechargeHistoryRows.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
              No recharge records yet.
            </p>
          ) : (
            <div className="plans-billing-history-scroll">
              <table className="plans-billing-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rechargeHistoryRows.map((r) => (
                    <tr key={r.id ?? `${billingRowMillis(r)}-${String(r.amount)}`}>
                      <td>{formatHistoryWhen(r)}</td>
                      <td>₹{formatInr(Number(r.amount))}</td>
                      <td>{normalizedRechargeHistoryStatus(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {billingViewTab === 'recharge' ? (
        <>
      <section className="card stack plans-billing-section" aria-label="Mode">
        <h2 className="plans-billing-section-title">
          {isLiveAccount ? 'Live billing' : 'Your mode'}
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.9375rem' }}>
          {billingIntroCopy(seller, effective)}
        </p>
        {!isLiveAccount ? (
          <ul className="plans-billing-pricing-list" style={{ marginTop: '0.75rem' }}>
            <li>
              <span className="plans-billing-pricing-label">Charge &amp; Go Live</span>
              <span className="plans-billing-pricing-value">First live top-up</span>
            </li>
            <li>
              <span className="plans-billing-pricing-label">Re-Charge &amp; Continue</span>
              <span className="plans-billing-pricing-value">Top up balance anytime</span>
            </li>
          </ul>
        ) : null}
      </section>

      <section className="card stack plans-billing-section" aria-label="Slot usage">
        <h2 className="plans-billing-section-title">Slots</h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
          Each active item = 1 slot, each combo = 1 slot, each active menu = 1 slot. Refresh after you
          change the catalog.
        </p>
        <ul className="plans-billing-pricing-list">
          <li>
            <span className="plans-billing-pricing-label">Total slots</span>
            <span className="plans-billing-pricing-value">{totalSlots}</span>
          </li>
          <li>
            <span className="plans-billing-pricing-label">Daily slot fee</span>
            <span className="plans-billing-pricing-value">
              ₹{dailySlotFee.toLocaleString('en-IN', { maximumFractionDigits: 2 })} (
              {totalSlots} × ₹{slotRate})
            </span>
          </li>
          <li>
            <span className="plans-billing-pricing-label">Order fee (est.)</span>
            <span className="plans-billing-pricing-value">{feePct}% of order value</span>
          </li>
          <li>
            <span className="plans-billing-pricing-label">Daily usage (est.)</span>
            <span className="plans-billing-pricing-value">
              ₹{dailyUsageEst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </li>
          {avgUsageOk ? (
            <li>
              <span className="plans-billing-pricing-label">Average daily usage</span>
              <span className="plans-billing-pricing-value">
                ₹{avgUsage.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </li>
          ) : null}
        </ul>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={slotBusy}
          onClick={handleRefreshSlots}
        >
          {slotBusy ? 'Refreshing…' : 'Refresh slot count from menu'}
        </button>
      </section>

      <section className="card stack plans-billing-section" aria-label="Wallet overview">
        <h2 className="plans-billing-section-title">Balance overview</h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
          Before your first successful recharge, average daily usage is estimated from slots plus
          confirmed orders (30-day) and fees. After recharge and billing deductions exist, we use your
          recent real average.
        </p>
        <ul className="plans-billing-pricing-list" style={{ marginTop: '0.65rem' }}>
          <li>
            <span className="plans-billing-pricing-label">Current available balance</span>
            <span className="plans-billing-pricing-value">₹{formatInr(balance)}</span>
          </li>
          <li>
            <span className="plans-billing-pricing-label">Average daily usage</span>
            <span className="plans-billing-pricing-value">
              {effectiveAvgDaily > 0 ? (
                <>
                  ₹{formatInr(effectiveAvgDaily)}
                  <span className="plans-billing-pricing-sublabel">
                    {avgDailyFromBilling ? ' From billing.' : ' Estimated.'}
                  </span>
                </>
              ) : (
                '—'
              )}
            </span>
          </li>
          <li>
            <span className="plans-billing-pricing-label">Suggested recharge (~30 days)</span>
            <span className="plans-billing-pricing-value">
              {suggested30DayRecharge != null ? `₹${formatInr(suggested30DayRecharge)}` : '—'}
            </span>
          </li>
          <li>
            <span className="plans-billing-pricing-label">Days left</span>
            <span className="plans-billing-pricing-value">
              {daysLeft != null ? `${daysLeft} d` : '—'}
            </span>
          </li>
          <li>
            <span className="plans-billing-pricing-label">Usage this cycle</span>
            <span className="plans-billing-pricing-value">₹{formatInr(usageTotal)}</span>
          </li>
          <li>
            <span className="plans-billing-pricing-label">Status</span>
            <span className="plans-billing-pricing-value">{billingHealthStatus(warn)}</span>
          </li>
        </ul>
      </section>

      <section className="plans-billing-recharge-hub card stack" aria-label="Recharge wallet">
        <h2 className="plans-billing-section-title plans-billing-recharge-hub__title">
          {isLiveAccount ? 'Charge & Go Live' : 'Recharge wallet'}
        </h2>

        <p className="plans-billing-subtle-title">Fixed amounts</p>
        <div className="plans-billing-packages plans-billing-packages--six" role="group">
          {NORMAL_QUICK_AMOUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className={`plans-billing-pkg${
                amountSource === 'preset' && presetAmount === n ? ' plans-billing-pkg--selected' : ''
              }`}
              onClick={() => pickQuickAmount(n)}
            >
              ₹{n.toLocaleString('en-IN')}
            </button>
          ))}
        </div>

        <div className="plans-billing-custom-days stack" style={{ marginTop: '1rem' }}>
          <p className="plans-billing-subtle-title" style={{ marginBottom: '0.35rem' }}>
            Custom days recharge
          </p>
          <label className="plans-billing-custom-days__field">
            <span className="label">How many days?</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 15"
              value={customRechargeDaysStr}
              onChange={(ev) => {
                setCustomRechargeDaysStr(ev.target.value);
                setAmountSource('customDays');
                setPresetAmount(null);
                setLastIntentId(null);
                setPayError('');
              }}
              autoComplete="off"
            />
          </label>
          {effectiveAvgDaily > 0 && customRechargeDaysParsed != null && customDaysRupees != null ? (
            <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
              {customRechargeDaysParsed} × ₹{formatInr(effectiveAvgDaily)} ={' '}
              <strong style={{ color: 'var(--text)' }}>₹{formatInr(customDaysRupees)}</strong>
            </p>
          ) : effectiveAvgDaily > 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
              Enter days (1–366) to see the amount.
            </p>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
              Daily usage estimate unavailable — add catalog slots or orders, or wait for billing
              history after your first top-up.
            </p>
          )}
          {customDaysRupees != null && amountSource === 'customDays' ? (
            <button
              type="button"
              className="btn btn-primary btn--sm"
              style={{ alignSelf: 'flex-start' }}
              disabled={actionsLocked || payBusy || !upiId}
              onClick={() => void handlePayViaUpi()}
            >
              {payBusy ? 'Saving…' : `Pay ₹${formatInr(customDaysRupees)}`}
            </button>
          ) : null}
        </div>

        {payAmount != null ? (
          <p className="plans-billing-pay-summary muted" style={{ margin: '0.75rem 0 0', fontSize: '0.9375rem' }}>
            Selected: <strong style={{ color: 'var(--text)' }}>₹{formatInr(payAmount)}</strong>
          </p>
        ) : (
          <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.875rem' }}>
            Pick a fixed package or complete custom days above, then accept terms and use Pay via UPI.
          </p>
        )}
      </section>

      <section className="card stack plans-billing-section" aria-label="Pricing">
        <h2 className="plans-billing-section-title">Rate defaults</h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
          Standard rates apply to your plan. Questions? WhatsApp support below.
        </p>
        <ul className="plans-billing-pricing-list">
          <li>
            <span className="plans-billing-pricing-label">Per slot / day</span>
            <span className="plans-billing-pricing-value">₹{slotRate}</span>
          </li>
          <li>
            <span className="plans-billing-pricing-label">Order value fee</span>
            <span className="plans-billing-pricing-value">{feePct}%</span>
          </li>
          {showTrialCopy ? (
            <li>
              <span className="plans-billing-pricing-label">Trial length</span>
              <span className="plans-billing-pricing-value">{settings.trialDays} days</span>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="card stack plans-billing-section">
        <label className="plans-billing-terms-label">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(ev) => setTermsAccepted(ev.target.checked)}
          />
          <span>I accept the terms for plans, billing, and payments on FaFo.</span>
        </label>
      </section>

      {payError ? <p className="error plans-billing-error">{payError}</p> : null}

      <section className="plans-billing-actions stack">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={actionsLocked || !upiId}
          onClick={handleCopyUpi}
        >
          {copyDone ? 'Copied UPI ID' : 'Copy UPI ID'}
        </button>
        <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
          You pay the FaFo platform using this UPI. Your own shop UPI for buyers is in Settings.
        </p>

        <button
          type="button"
          className="btn btn-primary plans-billing-pay-primary"
          disabled={actionsLocked || payAmount == null || payBusy || !upiId}
          onClick={handlePayViaUpi}
        >
          {payBusy ? 'Saving…' : payAmount != null ? `Pay ₹ ${formatInr(payAmount)}` : 'Pay via UPI'}
        </button>

        {waProofUrl && payAmount != null ? (
          <a
            href={actionsLocked ? undefined : waProofUrl}
            className={`btn btn-ghost plans-billing-wa${actionsLocked ? ' plans-billing-link-disabled' : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (actionsLocked) e.preventDefault();
            }}
          >
            Send payment details on WhatsApp
          </a>
        ) : null}
        {waSupportUrl ? (
          <a
            href={actionsLocked ? undefined : waSupportUrl}
            className={`btn btn-ghost plans-billing-wa${actionsLocked ? ' plans-billing-link-disabled' : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (actionsLocked) e.preventDefault();
            }}
          >
            WhatsApp support
          </a>
        ) : null}
      </section>

        </>
      ) : null}
      </fieldset>

      <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
        <Link to="/dashboard">← Back to dashboard</Link>
      </p>
    </div>
  );
}
