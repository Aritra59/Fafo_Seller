import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeller } from '../hooks/useSeller';
import {
  createBillingIntent,
  recomputeSellerSlotCount,
  subscribeBillingBySellerId,
  subscribeGlobalAppSettings,
} from '../services/firestore';
import {
  billingBalanceWarning,
  checkTrialStatus,
  getSellerDisplayBalance,
  resolveEffectiveSellerMode,
} from '../services/sellerHelpers';
import { buildUpiPayUrl } from '../services/upi';

const PACKAGES = [99, 249, 499, 799, 999, 4999];

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
    if (st === 'approved' || st === 'completed') {
      const amt = Number(r.amount);
      if (Number.isFinite(amt)) n += amt;
    }
  }
  return n;
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
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const [lastIntentId, setLastIntentId] = useState(null);
  const [slotBusy, setSlotBusy] = useState(false);

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

  const upiId =
    String(seller?.upiId ?? '').trim() ||
    String(import.meta.env.VITE_BILLING_UPI_ID ?? '').trim();
  const payeeName = String(seller?.upiName ?? seller?.shopName ?? 'FaFo').trim() || 'FaFo';
  const supportWa =
    import.meta.env.VITE_SUPPORT_WHATSAPP || seller?.phone || '';
  const effective = seller ? resolveEffectiveSellerMode(seller) : 'demo';
  const isLiveAccount = effective === 'live';
  const showTrialCopy = effective === 'freeTrial';

  const actionsLocked = !termsAccepted;

  const billingHeading =
    isLiveAccount && seller?.hasLiveHistory
      ? 'Re-Charge & Continue Selling'
      : isLiveAccount
        ? 'Charge & Go Live'
        : 'Plans & billing';

  const avgUsage = Number(seller?.averageDailyUsage);
  const avgUsageOk = Number.isFinite(avgUsage) && avgUsage >= 0;

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
    if (!seller?.id || actionsLocked || selectedAmount == null) return;
    setPayError('');
    setPayBusy(true);
    try {
      const id = await createBillingIntent({
        sellerId: seller.id,
        amount: selectedAmount,
      });
      setLastIntentId(id);
    } catch (err) {
      setPayError(err.message ?? 'Could not save billing request.');
    } finally {
      setPayBusy(false);
    }
  }

  const proofBody =
    selectedAmount != null && seller
      ? `Hello I paid ₹${selectedAmount.toLocaleString('en-IN')}\nSeller ID: ${seller.id}\nShop: ${String(seller.shopName ?? '').trim() || seller.shopCode || '—'}`
      : '';

  const waProofUrl = whatsappHref(supportWa, proofBody);

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
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Plans &amp; billing</h1>
        <p className="muted" style={{ margin: 0 }}>
          Set up your shop first to choose a package.
        </p>
        <Link to="/onboarding" className="btn btn-primary">
          Set up shop
        </Link>
      </div>
    );
  }

  const upiHref =
    upiId && selectedAmount != null
      ? buildUpiPayUrl({
          pa: upiId,
          pn: payeeName,
          am: String(selectedAmount),
        })
      : '';

  return (
    <div className="plans-billing">
      <header className="plans-billing-header">
        <h1 style={{ margin: 0, fontSize: '1.35rem', letterSpacing: '-0.02em' }}>
          {isLiveAccount ? billingHeading : 'Plans & billing'}
        </h1>
      </header>

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
        <h2 className="plans-billing-section-title">Slots &amp; usage</h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
          <strong>totalSlots</strong> = active products + combos + enabled menu sections (synced
          on your shop). Tap refresh after editing menu.
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

      <section className="card stack plans-billing-section" aria-label="Balance">
        <h2 className="plans-billing-section-title">Balance</h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
          balance ≈ approved recharge − usage (admin can sync fields on your seller doc).
        </p>
        <ul className="plans-billing-pricing-list">
          <li>
            <span className="plans-billing-pricing-label">Approved recharge</span>
            <span className="plans-billing-pricing-value">
              ₹{approvedRecharge.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </li>
          <li>
            <span className="plans-billing-pricing-label">Usage</span>
            <span className="plans-billing-pricing-value">
              ₹{usageTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </li>
          <li>
            <span className="plans-billing-pricing-label">Balance</span>
            <span className="plans-billing-pricing-value">
              ₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </li>
          <li>
            <span className="plans-billing-pricing-label">Status</span>
            <span className="plans-billing-pricing-value">{warn}</span>
          </li>
        </ul>
      </section>

      <section className="card stack plans-billing-section" aria-label="Pricing">
        <h2 className="plans-billing-section-title">Global defaults</h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
          From Firestore <code className="plans-billing-code">settings/global</code> (or defaults
          below).
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

      <section className="card stack plans-billing-section" aria-label="Packages">
        <h2 className="plans-billing-section-title">Packages</h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
          Select an amount, accept terms, then pay via UPI.
        </p>
        <div className="plans-billing-packages" role="group" aria-label="Package amount">
          {PACKAGES.map((n) => (
            <button
              key={n}
              type="button"
              className={`plans-billing-pkg${selectedAmount === n ? ' plans-billing-pkg--selected' : ''}`}
              onClick={() => {
                setSelectedAmount(n);
                setLastIntentId(null);
                setPayError('');
              }}
            >
              ₹{n.toLocaleString('en-IN')}
            </button>
          ))}
        </div>
      </section>

      {(seller?.qrImage || seller?.qrCodeUrl) && (
        <section className="card stack plans-billing-section" aria-label="QR">
          <h2 className="plans-billing-section-title">Scan QR</h2>
          <img
            src={String(seller.qrImage || seller.qrCodeUrl).trim()}
            alt="UPI QR"
            className="settings-qr-preview"
            loading="lazy"
          />
        </section>
      )}

      <section className="card stack plans-billing-section">
        <label className="plans-billing-terms-label">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(ev) => setTermsAccepted(ev.target.checked)}
          />
          <span>
            I accept the terms for plans, billing, and payments on FaFo.
          </span>
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
        {!upiId ? (
          <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
            Set your shop UPI in Settings, or <code className="plans-billing-code">
              VITE_BILLING_UPI_ID
            </code> in <code className="plans-billing-code">.env</code>.
          </p>
        ) : null}

        <button
          type="button"
          className="btn btn-primary"
          disabled={actionsLocked || selectedAmount == null || payBusy || !upiId}
          onClick={handlePayViaUpi}
        >
          {payBusy ? 'Saving…' : 'Pay via UPI'}
        </button>

        {waProofUrl && selectedAmount != null ? (
          <a
            href={actionsLocked ? undefined : waProofUrl}
            className={`btn btn-ghost plans-billing-wa${actionsLocked ? ' plans-billing-link-disabled' : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (actionsLocked) e.preventDefault();
            }}
          >
            WhatsApp payment proof
          </a>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
            Set <code className="plans-billing-code">VITE_SUPPORT_WHATSAPP</code> or your shop
            phone for WhatsApp proof.
          </p>
        )}
      </section>

      {lastIntentId && selectedAmount != null ? (
        <section
          className="card stack plans-billing-pay-ui"
          aria-label="UPI payment instructions"
        >
          <p className="plans-billing-pay-ui-title">Billing request saved</p>
          <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
            Amount <strong>₹{selectedAmount.toLocaleString('en-IN')}</strong> · Status{' '}
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

      <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
        <Link to="/dashboard">← Back to dashboard</Link>
      </p>
    </div>
  );
}
