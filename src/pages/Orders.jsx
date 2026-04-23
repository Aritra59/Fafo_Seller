import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isDemoExplorer } from '../constants/demoMode';
import { useSeller } from '../hooks/useSeller';
import {
  createQuickOrder,
  patchOrder,
  subscribeOrdersBySellerId,
  subscribeProductsBySellerId,
  updateOrderStatus,
} from '../services/firestore';

const TABS = [
  { id: 'new', label: 'New' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'history', label: 'History' },
];

/** History tab: terminal orders (include legacy statuses). */
const HISTORY_STATUSES = new Set([
  'completed',
  'cancelled',
  'delivered',
  'refunded',
]);

function normalizeStatus(status) {
  return String(status ?? '').trim().toLowerCase();
}

/** Filter one order for the active tab (dynamic when `tab` or `orders` changes). */
function orderMatchesTab(order, tabId) {
  const s = normalizeStatus(order.status);
  switch (tabId) {
    case 'new':
      return s === 'new';
    case 'preparing':
      return s === 'confirmed' || s === 'preparing';
    case 'ready':
      return s === 'ready';
    case 'history':
      return HISTORY_STATUSES.has(s);
    default:
      return false;
  }
}

function buyerPhone(order) {
  const p =
    order.buyerPhone ??
    order.phone ??
    order.customerPhone ??
    order.buyer?.phone ??
    null;
  if (typeof p === 'string' && p.trim()) return p.trim();
  return '—';
}

function buyerDisplayName(order) {
  const n =
    order.buyerName ??
    order.customerName ??
    order.buyer?.name ??
    order.name ??
    null;
  if (typeof n === 'string' && n.trim()) return n.trim();
  return '';
}

function shortOrderIdForMsg(id) {
  const str = String(id ?? '');
  if (str.length <= 12) return str;
  return `${str.slice(0, 6)}…${str.slice(-4)}`;
}

function buildReadyWhatsAppBody(seller, order) {
  const tpl =
    typeof seller?.orderReadyTemplate === 'string' && seller.orderReadyTemplate.trim()
      ? seller.orderReadyTemplate.trim()
      : '';
  const buyer = buyerDisplayName(order) || 'Customer';
  const shop = seller?.shopName?.trim() || 'Our shop';
  const oid = shortOrderIdForMsg(order.id);
  if (tpl) {
    return tpl
      .replace(/\{buyerName\}/gi, buyer)
      .replace(/\{shopName\}/gi, shop)
      .replace(/\{orderId\}/gi, oid);
  }
  return `Hello ${buyer},\nYour order from ${shop} is ready.\nPlease collect it.\nOrder ID: ${oid}`;
}

/**
 * Open WhatsApp to buyer (digits-only `wa.me` number).
 */
function openWhatsAppWithBody(order, body) {
  const raw =
    order.buyerPhone ??
    order.phone ??
    order.customerPhone ??
    order.buyer?.phone ??
    '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return;
  const message = encodeURIComponent(body);
  window.open(`https://wa.me/${digits}?text=${message}`, '_blank', 'noopener,noreferrer');
}

function normalizeLineItems(order) {
  const raw = order.items ?? order.lineItems ?? order.lines;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  return raw.map((line) => {
    const name =
      line.name ?? line.title ?? line.productName ?? line.label ?? 'Item';
    const qty = line.quantity ?? line.qty ?? 1;
    const q = Number(qty);
    const qtyLabel = Number.isFinite(q) && q > 0 ? q : 1;
    const unitRaw = line.price ?? line.unitPrice;
    const unit = unitRaw != null ? Number(unitRaw) : null;
    const unitOk = Number.isFinite(unit) && unit >= 0;
    const lineTotal = unitOk ? unit * qtyLabel : null;
    return {
      name: String(name),
      quantity: qtyLabel,
      unitPrice: unitOk ? unit : null,
      lineTotal: lineTotal != null && Number.isFinite(lineTotal) ? lineTotal : null,
    };
  });
}

function statusBadgeClass(status) {
  const s = normalizeStatus(status);
  if (s === 'new') return 'orders-card-status orders-card-status--new';
  if (s === 'confirmed') return 'orders-card-status orders-card-status--confirmed';
  if (s === 'preparing') return 'orders-card-status orders-card-status--preparing';
  if (s === 'ready') return 'orders-card-status orders-card-status--ready';
  if (HISTORY_STATUSES.has(s)) {
    return 'orders-card-status orders-card-status--history';
  }
  return 'orders-card-status orders-card-status--muted';
}

function statusBadgeLabel(status) {
  const s = normalizeStatus(status);
  if (s === 'new') return 'New';
  if (s === 'confirmed') return 'Confirmed';
  if (s === 'preparing') return 'Preparing';
  if (s === 'ready') return 'Ready';
  if (HISTORY_STATUSES.has(s)) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return String(status ?? 'Unknown').trim() || 'Unknown';
}

function shortOrderId(id) {
  const str = String(id ?? '');
  if (str.length <= 12) return str;
  return `${str.slice(0, 6)}…${str.slice(-4)}`;
}

function orderTotal(order) {
  const v = order.totalAmount ?? order.total ?? order.amount;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatRupee(n) {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatCreatedAt(ts) {
  if (ts == null) return '';
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

export function Orders() {
  const { seller, sellerId, loading: sellerLoading, error: sellerError } = useSeller();
  const [tab, setTab] = useState('new');
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState(null);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [quickBuyerName, setQuickBuyerName] = useState('');
  const [quickBuyerPhone, setQuickBuyerPhone] = useState('');
  const [quickTotal, setQuickTotal] = useState('');
  const [quickPayment, setQuickPayment] = useState('cash');
  const [quickBusy, setQuickBusy] = useState(false);
  const demoReadOnly = isDemoExplorer();
  /** Per order: must check before Confirm (new orders only). */
  const [acceptByOrder, setAcceptByOrder] = useState({});
  const [productRows, setProductRows] = useState([]);
  const [quickLines, setQuickLines] = useState([{ productId: '', qty: '1' }]);
  const [quickAddress, setQuickAddress] = useState('');

  useEffect(() => {
    if (!sellerId) {
      setOrders([]);
      setOrdersLoading(false);
      setOrdersError(null);
      return undefined;
    }

    setOrdersLoading(true);
    setOrdersError(null);

    const unsub = subscribeOrdersBySellerId(
      sellerId,
      (rows) => {
        setOrders(rows);
        setOrdersLoading(false);
        setOrdersError(null);
      },
      (err) => {
        setOrdersError(err);
        setOrders([]);
        setOrdersLoading(false);
      },
    );

    return () => unsub();
  }, [sellerId]);

  useEffect(() => {
    if (!sellerId) {
      setProductRows([]);
      return undefined;
    }
    const unsub = subscribeProductsBySellerId(
      sellerId,
      (rows) => setProductRows(rows),
      () => setProductRows([]),
    );
    return () => unsub();
  }, [sellerId]);

  const filtered = useMemo(
    () => orders.filter((o) => orderMatchesTab(o, tab)),
    [orders, tab],
  );

  async function handleConfirmOrder(orderId) {
    if (!sellerId || !acceptByOrder[orderId]) return;
    setActionError(null);
    setBusyOrderId(orderId);
    try {
      await patchOrder(orderId, sellerId, {
        status: 'confirmed',
        paymentAccepted: true,
        paymentReceived: true,
      });
    } catch (e) {
      setActionError(e.message ?? 'Could not confirm order.');
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleCancelOrder(orderId) {
    if (!sellerId) return;
    if (!window.confirm('Cancel this order?')) return;
    setActionError(null);
    setBusyOrderId(orderId);
    try {
      await updateOrderStatus(orderId, sellerId, 'cancelled');
    } catch (e) {
      setActionError(e.message ?? 'Could not cancel order.');
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleStartPreparing(orderId) {
    if (!sellerId) return;
    setActionError(null);
    setBusyOrderId(orderId);
    try {
      await updateOrderStatus(orderId, sellerId, 'preparing');
    } catch (e) {
      setActionError(e.message ?? 'Could not update order.');
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleMarkComplete(orderId) {
    if (!sellerId) return;
    setActionError(null);
    setBusyOrderId(orderId);
    try {
      await updateOrderStatus(orderId, sellerId, 'completed');
    } catch (e) {
      setActionError(e.message ?? 'Could not complete order.');
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleMarkReady(order) {
    if (!sellerId) return;
    setActionError(null);
    setBusyOrderId(order.id);
    try {
      await updateOrderStatus(order.id, sellerId, 'ready');
    } catch (e) {
      setActionError(e.message ?? 'Could not update order.');
    } finally {
      setBusyOrderId(null);
    }
  }

  function handleSendWhatsAppReady(order) {
    if (!seller) return;
    const body = buildReadyWhatsAppBody(seller, order);
    openWhatsAppWithBody(order, body);
  }

  function addQuickLine() {
    setQuickLines((prev) => [...prev, { productId: '', qty: '1' }]);
  }

  function updateQuickLine(idx, patch) {
    setQuickLines((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  }

  function removeQuickLine(idx) {
    setQuickLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  async function handleQuickOrder(e) {
    e.preventDefault();
    if (!sellerId || demoReadOnly) return;
    setActionError(null);
    setQuickBusy(true);
    try {
      const name = quickBuyerName.trim();
      const phone = quickBuyerPhone.trim();
      const total = Number(quickTotal);
      if (!name) throw new Error('Buyer name is required.');
      if (!phone) throw new Error('Buyer phone is required.');
      if (!Number.isFinite(total) || total < 0) throw new Error('Enter a valid total.');

      const items = [];
      let computed = 0;
      for (const line of quickLines) {
        const pid = String(line.productId ?? '').trim();
        const qty = Number(line.qty);
        if (!pid) continue;
        if (!Number.isFinite(qty) || qty <= 0) throw new Error('Each line needs a valid quantity.');
        const p = productRows.find((x) => x.id === pid);
        const unit = p != null ? Number(p.price) : NaN;
        if (!Number.isFinite(unit) || unit < 0) throw new Error('Invalid product selection.');
        const label = String(p.name ?? p.title ?? 'Item').trim() || 'Item';
        items.push({ name: label, qty, price: unit });
        computed += unit * qty;
      }
      if (items.length === 0) {
        throw new Error('Select at least one menu item.');
      }

      await createQuickOrder(sellerId, {
        buyerName: name,
        buyerPhone: phone,
        buyerAddress: quickAddress.trim() || undefined,
        items,
        total: Number.isFinite(total) && total > 0 ? total : computed,
        paymentMode: quickPayment,
      });
      setQuickBuyerName('');
      setQuickBuyerPhone('');
      setQuickAddress('');
      setQuickLines([{ productId: '', qty: '1' }]);
      setQuickTotal('');
      setQuickPayment('cash');
    } catch (err) {
      setActionError(err.message ?? 'Could not save quick order.');
    } finally {
      setQuickBusy(false);
    }
  }

  if (sellerLoading) {
    return (
      <div className="orders-page card">
        <p className="muted" style={{ margin: 0 }}>
          Loading…
        </p>
      </div>
    );
  }

  if (sellerError) {
    return (
      <div className="orders-page card stack">
        <p className="error" style={{ margin: 0 }}>
          {sellerError.message ?? 'Could not load shop.'}
        </p>
        <Link to="/" className="btn btn-ghost">
          Home
        </Link>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="orders-page card stack">
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Orders</h1>
        <p className="muted" style={{ margin: 0 }}>
          Set up your shop to see orders.
        </p>
        <Link to="/onboarding" className="btn btn-primary">
          Set up shop
        </Link>
      </div>
    );
  }

  return (
    <div className="orders-page">
      <header className="orders-page-header">
        <h1 style={{ margin: 0, fontSize: '1.35rem', letterSpacing: '-0.02em' }}>
          Orders
        </h1>
      </header>

      <section className="card orders-quick" aria-labelledby="orders-quick-title">
        <h2 id="orders-quick-title" style={{ margin: 0, fontSize: '1.05rem' }}>
          Quick order (walk-in)
        </h2>
        <p className="muted" style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.875rem' }}>
          Creates a manual order in <strong>Preparing</strong> (skips New). Use for counter /
          phone orders.
        </p>
        {demoReadOnly ? (
          <p className="muted" style={{ margin: 0 }}>
            Sign in to create real quick orders. Demo mode is read-only.
          </p>
        ) : (
          <form className="orders-quick-form stack" onSubmit={handleQuickOrder}>
            <div className="orders-quick-row">
              <label className="orders-quick-field">
                <span className="orders-quick-label">Buyer name</span>
                <input
                  className="input"
                  value={quickBuyerName}
                  onChange={(ev) => setQuickBuyerName(ev.target.value)}
                  autoComplete="name"
                  required
                />
              </label>
              <label className="orders-quick-field">
                <span className="orders-quick-label">Phone</span>
                <input
                  className="input"
                  type="tel"
                  value={quickBuyerPhone}
                  onChange={(ev) => setQuickBuyerPhone(ev.target.value)}
                  autoComplete="tel"
                  required
                />
              </label>
            </div>
            <div className="orders-quick-row">
              <label className="orders-quick-field orders-quick-field--grow">
                <span className="orders-quick-label">Address (optional)</span>
                <input
                  className="input"
                  value={quickAddress}
                  onChange={(ev) => setQuickAddress(ev.target.value)}
                  placeholder="Delivery / pickup notes"
                />
              </label>
            </div>
            <div className="stack" style={{ gap: '0.65rem' }}>
              <span className="orders-quick-label">Items from menu</span>
              {quickLines.map((line, idx) => (
                <div className="orders-quick-row" key={`ql-${idx}`}>
                  <label className="orders-quick-field orders-quick-field--grow">
                    <span className="sr-only">Product</span>
                    <select
                      className="input"
                      value={line.productId}
                      onChange={(ev) => updateQuickLine(idx, { productId: ev.target.value })}
                      required={idx === 0}
                    >
                      <option value="">Select product…</option>
                      {productRows.map((p) => (
                        <option key={p.id} value={p.id}>
                          {String(p.name ?? p.title ?? p.id)} — ₹{Number(p.price ?? 0)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="orders-quick-field">
                    <span className="sr-only">Qty</span>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      step="1"
                      value={line.qty}
                      onChange={(ev) => updateQuickLine(idx, { qty: ev.target.value })}
                      aria-label="Quantity"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => removeQuickLine(idx)}
                    disabled={quickLines.length <= 1}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" onClick={addQuickLine}>
                + Add line
              </button>
            </div>
            <div className="orders-quick-row">
              <label className="orders-quick-field">
                <span className="orders-quick-label">Total (₹)</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={quickTotal}
                  onChange={(ev) => setQuickTotal(ev.target.value)}
                  placeholder="Leave 0 to auto-sum lines"
                />
              </label>
              <label className="orders-quick-field">
                <span className="orders-quick-label">Payment</span>
                <select
                  className="input"
                  value={quickPayment}
                  onChange={(ev) => setQuickPayment(ev.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                </select>
              </label>
            </div>
            <button type="submit" className="btn btn-primary" disabled={quickBusy}>
              {quickBusy ? 'Saving…' : 'Save quick order'}
            </button>
          </form>
        )}
      </section>

      <div className="orders-page-tabs" role="tablist" aria-label="Order status">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`orders-page-tab${tab === t.id ? ' orders-page-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {ordersError ? (
        <p className="error orders-page-error" style={{ margin: 0 }}>
          {ordersError.message ?? 'Could not load orders.'}
          {' '}
          <span className="muted" style={{ fontSize: '0.875rem' }}>
            If this is your first time, create the Firestore index for{' '}
            <code className="orders-page-code">sellerId</code> +{' '}
            <code className="orders-page-code">createdAt</code>.
          </span>
        </p>
      ) : null}

      {actionError ? (
        <p className="error orders-page-action-error" style={{ margin: 0 }}>
          {actionError}
        </p>
      ) : null}

      {ordersLoading ? (
        <p className="muted" style={{ margin: 0 }}>
          Loading orders…
        </p>
      ) : filtered.length === 0 ? (
        <div className="card orders-page-empty">
          <p className="muted" style={{ margin: 0 }}>
            No orders in this tab yet.
          </p>
        </div>
      ) : (
        <ul className="orders-page-list">
          {filtered.map((o) => {
            const lines = normalizeLineItems(o);
            const total = orderTotal(o);
            const when = formatCreatedAt(o.createdAt);
            const st = normalizeStatus(o.status);
            const actionDisabled = busyOrderId === o.id || demoReadOnly;
            const bName = buyerDisplayName(o);
            const sourceQuick = String(o.source ?? '').toLowerCase() === 'quick';
            const showNewActions = tab === 'new' && st === 'new';
            const showConfirmedStart = tab === 'preparing' && st === 'confirmed';
            const showMarkReady = tab === 'preparing' && st === 'preparing';
            const showReadyActions = tab === 'ready' && st === 'ready';
            const acceptInteractive = st === 'new';
            const acceptChecked = acceptInteractive
              ? Boolean(acceptByOrder[o.id])
              : true;
            const addr =
              typeof o.buyerAddress === 'string' && o.buyerAddress.trim()
                ? o.buyerAddress.trim()
                : typeof o.address === 'string' && o.address.trim()
                  ? o.address.trim()
                  : '';
            const payMode = String(o.paymentMode ?? o.payment ?? '—').trim() || '—';

            return (
              <li key={o.id}>
                <article className="orders-card card">
                  <div className="orders-card-head">
                    <span className={statusBadgeClass(o.status)}>
                      {statusBadgeLabel(o.status)}
                    </span>
                    {when ? (
                      <span className="orders-card-time">{when}</span>
                    ) : (
                      <span className="orders-card-time orders-card-time--empty">—</span>
                    )}
                  </div>
                  <p className="muted orders-card-source" style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem' }}>
                    {sourceQuick ? 'Source · Walk-in (quick)' : 'Source · Buyer app'}
                  </p>

                  <div className="orders-card-meta">
                    <div className="orders-card-meta-block">
                      <span className="orders-card-meta-label">Order</span>
                      <p className="orders-card-id-wrap" title={o.id}>
                        <code className="orders-card-id-code">{shortOrderId(o.id)}</code>
                      </p>
                    </div>
                    <div className="orders-card-meta-block orders-card-meta-block--phone">
                      <span className="orders-card-meta-label">Buyer</span>
                      <p className="orders-card-phone-value">
                        {bName ? (
                          <>
                            <span className="orders-card-buyer-name">{bName}</span>
                            <span className="orders-card-buyer-sep"> · </span>
                          </>
                        ) : null}
                        <span>{buyerPhone(o)}</span>
                      </p>
                    </div>
                    <div className="orders-card-meta-block">
                      <span className="orders-card-meta-label">Payment</span>
                      <p className="orders-card-phone-value" style={{ margin: 0 }}>
                        {payMode}
                      </p>
                    </div>
                  </div>
                  {addr ? (
                    <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.875rem' }}>
                      <strong>Address:</strong> {addr}
                    </p>
                  ) : null}

                  <div className="orders-card-section">
                    <p className="orders-card-section-title">Items</p>
                    {lines.length > 0 ? (
                      <ul className="orders-card-item-grid">
                        {lines.map((line, idx) => {
                          const lineAmt =
                            line.lineTotal != null
                              ? line.lineTotal
                              : line.unitPrice != null
                                ? line.unitPrice * line.quantity
                                : null;
                          return (
                            <li key={`${o.id}-line-${idx}`} className="orders-card-item-tile">
                              <span className="orders-card-item-tile-name">{line.name}</span>
                              <span className="orders-card-item-tile-qty">×{line.quantity}</span>
                              <span className="orders-card-price-tag">
                                {lineAmt != null && Number.isFinite(lineAmt)
                                  ? formatRupee(lineAmt)
                                  : '—'}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="muted orders-card-no-items" style={{ margin: 0 }}>
                        No line items
                      </p>
                    )}
                  </div>

                  <div className="orders-card-summary" aria-label="Order summary">
                    <div className="orders-card-summary-inner">
                      <span className="orders-card-summary-label">Order total</span>
                      <span className="orders-card-summary-amount">{formatRupee(total)}</span>
                    </div>
                  </div>

                  <div className="orders-card-eta" role="status">
                    <div className="orders-card-eta-row">
                      <span className="orders-card-eta-label">ETA</span>
                      <span className="orders-card-eta-value muted">—</span>
                    </div>
                    <span className="orders-card-eta-hint">Estimated pickup</span>
                  </div>

                  <div className="orders-card-prefs" aria-label="Order options">
                    <label
                      className={`orders-card-pref orders-card-pref--pay${!acceptInteractive ? ' orders-card-pref--disabled' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="orders-card-pref-input"
                        disabled={!acceptInteractive}
                        checked={acceptChecked}
                        onChange={(e) => {
                          if (!acceptInteractive) return;
                          setAcceptByOrder((prev) => ({
                            ...prev,
                            [o.id]: e.target.checked,
                          }));
                        }}
                      />
                      <span className="orders-card-pref-meta">
                        <span className="orders-card-pref-title">Payment received</span>
                        <span className="orders-card-pref-sub">
                          Required before you can confirm this order
                        </span>
                      </span>
                    </label>
                  </div>

                  {showNewActions ? (
                    <div className="orders-card-actions orders-card-actions--split">
                      <button
                        type="button"
                        className="btn btn-primary orders-card-action"
                        disabled={actionDisabled || !acceptByOrder[o.id]}
                        onClick={() => handleConfirmOrder(o.id)}
                      >
                        {busyOrderId === o.id ? 'Saving…' : 'Confirm order'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost orders-card-action orders-card-action--danger"
                        disabled={actionDisabled}
                        onClick={() => handleCancelOrder(o.id)}
                      >
                        Cancel order
                      </button>
                    </div>
                  ) : null}

                  {showConfirmedStart ? (
                    <div className="orders-card-actions">
                      <button
                        type="button"
                        className="btn btn-primary orders-card-action"
                        disabled={actionDisabled}
                        onClick={() => handleStartPreparing(o.id)}
                      >
                        {busyOrderId === o.id ? 'Updating…' : 'Start preparing'}
                      </button>
                    </div>
                  ) : null}

                  {showMarkReady ? (
                    <div className="orders-card-actions">
                      <button
                        type="button"
                        className="btn btn-primary orders-card-action"
                        disabled={actionDisabled}
                        onClick={() => handleMarkReady(o)}
                      >
                        {busyOrderId === o.id ? 'Updating…' : 'Mark ready'}
                      </button>
                    </div>
                  ) : null}

                  {showReadyActions ? (
                    <div className="orders-card-actions orders-card-actions--split">
                      <button
                        type="button"
                        className="btn btn-ghost orders-card-action"
                        disabled={actionDisabled}
                        onClick={() => handleSendWhatsAppReady(o)}
                      >
                        Send WhatsApp
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary orders-card-action"
                        disabled={actionDisabled}
                        onClick={() => handleMarkComplete(o.id)}
                      >
                        {busyOrderId === o.id ? 'Updating…' : 'Mark completed'}
                      </button>
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
        <Link to="/dashboard">← Back to dashboard</Link>
      </p>
    </div>
  );
}
