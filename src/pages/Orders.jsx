import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isDemoExplorer } from '../constants/demoMode';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { useSeller } from '../hooks/useSeller';
import { lineItemCount } from '../services/customerService';
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

function statusBadgeClass(status) {
  const s = normalizeStatus(status);
  if (s === 'new') return 'orders-pos-badge orders-pos-badge--new';
  if (s === 'confirmed') return 'orders-pos-badge orders-pos-badge--confirmed';
  if (s === 'preparing') return 'orders-pos-badge orders-pos-badge--preparing';
  if (s === 'ready') return 'orders-pos-badge orders-pos-badge--ready';
  if (HISTORY_STATUSES.has(s)) {
    return 'orders-pos-badge orders-pos-badge--history';
  }
  return 'orders-pos-badge orders-pos-badge--muted';
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

function formatCreatedParts(ts) {
  if (ts == null) return { date: '', time: '' };
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return { date: '', time: '' };
    return {
      date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      time: d.toLocaleTimeString('en-IN', { timeStyle: 'short' }),
    };
  } catch {
    return { date: '', time: '' };
  }
}

function orderPaymentLabel(order) {
  const st = normalizeStatus(order.status);
  if (st === 'cancelled') return '—';
  if (order.paymentReceived === true || order.paymentAccepted === true) {
    return 'Paid';
  }
  const mode = String(order.paymentMode ?? order.payment ?? '').toLowerCase();
  if (mode === 'upi') return 'UPI';
  if (mode === 'cash') return 'Cash';
  return 'Pending';
}

const OrderPosTile = memo(function OrderPosTile({ order, onSelect }) {
  const total = orderTotal(order);
  const items = lineItemCount(order) || 0;
  const { date, time } = formatCreatedParts(order.createdAt);
  const bName = buyerDisplayName(order);
  const phone = buyerPhone(order);
  const st = normalizeStatus(order.status);

  return (
    <button
      type="button"
      className="orders-pos-tile"
      onClick={() => onSelect(order)}
      aria-label={`Order ${shortOrderId(order.id)}, ${statusBadgeLabel(order.status)}`}
    >
      <div className="orders-pos-tile__top">
        <span className={statusBadgeClass(order.status)}>{statusBadgeLabel(order.status)}</span>
        <code className="orders-pos-tile__id" translate="no">
          {shortOrderId(order.id)}
        </code>
      </div>
      <p className="orders-pos-tile__buyer">
        {bName ? <span className="orders-pos-tile__name">{bName}</span> : null}
        {bName ? <span className="orders-pos-tile__sep"> · </span> : null}
        <span className="orders-pos-tile__phone">{phone}</span>
      </p>
      <div className="orders-pos-tile__row">
        <span className="orders-pos-tile__total">{formatRupee(total)}</span>
        <span className="orders-pos-tile__meta">
          {items} item{items === 1 ? '' : 's'}
        </span>
      </div>
      <p className="orders-pos-tile__pay muted" style={{ margin: 0, fontSize: '0.75rem' }}>
        {orderPaymentLabel(order)}
      </p>
      <div className="orders-pos-tile__time muted">
        {date ? (
          <>
            <span>{date}</span>
            {time ? <span className="orders-pos-tile__time-sep">{time}</span> : null}
          </>
        ) : (
          '—'
        )}
      </div>
      {st === 'new' ? (
        <p className="orders-pos-tile__hint muted">Tap for payment check &amp; confirm</p>
      ) : null}
    </button>
  );
});

function orderHasModalActions(order, tabId) {
  const st = normalizeStatus(order.status);
  if (tabId === 'new' && st === 'new') return true;
  if (tabId === 'preparing' && (st === 'confirmed' || st === 'preparing')) return true;
  if (tabId === 'ready' && st === 'ready') return true;
  return false;
}

function OrderModalActions({
  order,
  tab,
  busyOrderId,
  demoReadOnly,
  acceptByOrder,
  setAcceptByOrder,
  onConfirm,
  onCancel,
  onStartPreparing,
  onMarkReady,
  onMarkComplete,
  onWhatsAppReady,
}) {
  const st = normalizeStatus(order.status);
  const actionDisabled = busyOrderId === order.id || demoReadOnly;
  const showNewActions = tab === 'new' && st === 'new';
  const showConfirmedStart = tab === 'preparing' && st === 'confirmed';
  const showMarkReady = tab === 'preparing' && st === 'preparing';
  const showReadyActions = tab === 'ready' && st === 'ready';
  const acceptInteractive = st === 'new';
  const acceptChecked = acceptInteractive ? Boolean(acceptByOrder[order.id]) : true;

  return (
    <div className="orders-modal-actions stack" style={{ gap: '0.65rem' }}>
      {acceptInteractive ? (
        <label className={`orders-card-pref orders-card-pref--pay${!acceptInteractive ? ' orders-card-pref--disabled' : ''}`}>
          <input
            type="checkbox"
            className="orders-card-pref-input"
            disabled={!acceptInteractive}
            checked={acceptChecked}
            onChange={(e) => {
              setAcceptByOrder((prev) => ({
                ...prev,
                [order.id]: e.target.checked,
              }));
            }}
          />
          <span className="orders-card-pref-meta">
            <span className="orders-card-pref-title">Payment received</span>
            <span className="orders-card-pref-sub">Required before you can confirm this order</span>
          </span>
        </label>
      ) : null}

      {showNewActions ? (
        <div className="orders-card-actions orders-card-actions--split">
          <button
            type="button"
            className="btn btn-primary orders-card-action"
            disabled={actionDisabled || !acceptByOrder[order.id]}
            onClick={() => onConfirm(order.id)}
          >
            {busyOrderId === order.id ? 'Saving…' : 'Confirm order'}
          </button>
          <button
            type="button"
            className="btn btn-ghost orders-card-action orders-card-action--danger"
            disabled={actionDisabled}
            onClick={() => onCancel(order.id)}
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
            onClick={() => onStartPreparing(order.id)}
          >
            {busyOrderId === order.id ? 'Updating…' : 'Start preparing'}
          </button>
        </div>
      ) : null}

      {showMarkReady ? (
        <div className="orders-card-actions">
          <button
            type="button"
            className="btn btn-primary orders-card-action"
            disabled={actionDisabled}
            onClick={() => onMarkReady(order)}
          >
            {busyOrderId === order.id ? 'Updating…' : 'Mark ready'}
          </button>
        </div>
      ) : null}

      {showReadyActions ? (
        <div className="orders-card-actions orders-card-actions--split">
          <button
            type="button"
            className="btn btn-ghost orders-card-action"
            disabled={actionDisabled}
            onClick={() => onWhatsAppReady(order)}
          >
            Send WhatsApp
          </button>
          <button
            type="button"
            className="btn btn-primary orders-card-action"
            disabled={actionDisabled}
            onClick={() => onMarkComplete(order.id)}
          >
            {busyOrderId === order.id ? 'Updating…' : 'Mark completed'}
          </button>
        </div>
      ) : null}

    </div>
  );
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
  const [quickOpen, setQuickOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const demoReadOnly = isDemoExplorer();
  const [acceptByOrder, setAcceptByOrder] = useState({});
  const [productRows, setProductRows] = useState([]);
  const [quickLines, setQuickLines] = useState([{ productId: '', qty: '1' }]);
  const [quickAddress, setQuickAddress] = useState('');

  const selectedOrder = useMemo(
    () => (selectedOrderId ? orders.find((o) => o.id === selectedOrderId) ?? null : null),
    [orders, selectedOrderId],
  );

  useEffect(() => {
    if (selectedOrderId && !orders.some((o) => o.id === selectedOrderId)) {
      setSelectedOrderId(null);
    }
  }, [orders, selectedOrderId]);

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

  const openQuick = useCallback(() => setQuickOpen(true), []);
  const closeQuick = useCallback(() => setQuickOpen(false), []);

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
        items.push({ productId: pid, name: label, qty, price: unit });
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
      setQuickOpen(false);
      setTab('preparing');
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
    <div className="orders-page orders-page--pos">
      <header className="orders-page-header orders-page-header--title-row">
        <h1 className="orders-page-title" style={{ margin: 0, fontSize: '1.35rem', letterSpacing: '-0.02em' }}>
          Orders
        </h1>
        <button
          type="button"
          className="orders-quick-header-btn btn btn-primary"
          onClick={openQuick}
          aria-haspopup="dialog"
          aria-expanded={quickOpen}
        >
          + Quick order
        </button>
      </header>

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
          {ordersError.message ?? 'Could not load orders.'}{' '}
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
        <ul className="orders-pos-grid">
          {filtered.map((o) => (
            <li key={o.id}>
              <OrderPosTile order={o} onSelect={() => setSelectedOrderId(o.id)} />
            </li>
          ))}
        </ul>
      )}

      <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
        <Link to="/dashboard">← Back to dashboard</Link>
      </p>

      {quickOpen ? (
        <div className="orders-quick-overlay" role="presentation">
          <button
            type="button"
            className="orders-quick-overlay__backdrop"
            aria-label="Close quick order"
            onClick={closeQuick}
          />
          <div
            className="orders-quick-sheet card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="orders-quick-title"
          >
            <div className="orders-quick-sheet__head">
              <h2 id="orders-quick-title" style={{ margin: 0, fontSize: '1.1rem' }}>
                Quick order
              </h2>
              <button type="button" className="btn btn-ghost" onClick={closeQuick} aria-label="Close">
                ✕
              </button>
            </div>
            <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.875rem' }}>
              Creates a walk-in order in <strong>Preparing</strong> (skips New).
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
                  <span className="orders-quick-label">Menu items</span>
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
          </div>
        </div>
      ) : null}

      {selectedOrder && seller ? (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => setSelectedOrderId(null)}
          actions={
            orderHasModalActions(selectedOrder, tab) ? (
              <OrderModalActions
                order={selectedOrder}
                tab={tab}
                busyOrderId={busyOrderId}
                demoReadOnly={demoReadOnly}
                acceptByOrder={acceptByOrder}
                setAcceptByOrder={setAcceptByOrder}
                onConfirm={handleConfirmOrder}
                onCancel={handleCancelOrder}
                onStartPreparing={handleStartPreparing}
                onMarkReady={handleMarkReady}
                onMarkComplete={handleMarkComplete}
                onWhatsAppReady={handleSendWhatsAppReady}
              />
            ) : null
          }
        />
      ) : null}
    </div>
  );
}
