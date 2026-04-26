import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { subscribeMenuGroupsBySellerId } from '../services/menuGroupsService';
import { isDemoExplorer } from '../constants/demoMode';
import { useRegisterPageTitleSuffix } from '../context/SellerPageTitleContext';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { useSeller } from '../hooks/useSeller';
import { lineItemCount } from '../services/customerService';
import {
  createQuickOrder,
  patchOrder,
  subscribeCombosBySellerId,
  subscribeGlobalCuisineCategories,
  subscribeGlobalMenuCategories,
  subscribeOrdersBySellerId,
  subscribeProductsBySellerId,
  updateOrderStatus,
} from '../services/firestore';
import { normalizeComboProductIds } from '../components/menu/ComboCollageMedia';
import {
  cuisineFilterKey,
  cuisineFilterLabel,
  menuFilterKey,
  menuFilterLabel,
} from '../utils/productCatalogFilters';
import {
  combosForStorefrontSession,
  productsForStorefrontSession,
  resolveActiveMenuGroupForSeller,
} from '../utils/storefrontSessionBrowse';

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

function browseProductName(p) {
  const n = p?.name ?? p?.title;
  return typeof n === 'string' && n.trim() ? n.trim() : 'Item';
}

function browseComboName(c) {
  const n = c?.name ?? c?.title;
  return typeof n === 'string' && n.trim() ? n.trim() : 'Combo';
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
  const [quickPayment, setQuickPayment] = useState('cash');
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const demoReadOnly = isDemoExplorer();
  const ordersTabLabel = TABS.find((t) => t.id === tab)?.label ?? '';
  useRegisterPageTitleSuffix(ordersTabLabel);
  const [acceptByOrder, setAcceptByOrder] = useState({});
  const [productRows, setProductRows] = useState([]);
  const [comboRows, setComboRows] = useState([]);
  const [menuRows, setMenuRows] = useState([]);
  const [quickCuisineKey, setQuickCuisineKey] = useState('');
  const [quickMenuKey, setQuickMenuKey] = useState('');
  const [menuClock, setMenuClock] = useState(() => Date.now());
  const [globalCuisines, setGlobalCuisines] = useState([]);
  const [globalMenus, setGlobalMenus] = useState([]);
  const [quickCartP, setQuickCartP] = useState({});
  const [quickCartC, setQuickCartC] = useState({});
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

  useEffect(() => {
    if (!sellerId) {
      setComboRows([]);
      return undefined;
    }
    return subscribeCombosBySellerId(
      sellerId,
      (rows) => setComboRows(rows),
      () => setComboRows([]),
    );
  }, [sellerId]);

  useEffect(() => {
    if (!sellerId) {
      setMenuRows([]);
      return undefined;
    }
    return subscribeMenuGroupsBySellerId(
      sellerId,
      (rows) => setMenuRows(rows || []),
      () => setMenuRows([]),
    );
  }, [sellerId]);

  useEffect(() => {
    const id = window.setInterval(() => setMenuClock(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const u1 = subscribeGlobalCuisineCategories(
      (rows) => setGlobalCuisines(Array.isArray(rows) ? rows : []),
      () => setGlobalCuisines([]),
    );
    const u2 = subscribeGlobalMenuCategories(
      (rows) => setGlobalMenus(Array.isArray(rows) ? rows : []),
      () => setGlobalMenus([]),
    );
    return () => {
      u1();
      u2();
    };
  }, []);

  const activeMenu = useMemo(
    () =>
      seller
        ? resolveActiveMenuGroupForSeller({
            seller,
            menuGroupRows: menuRows,
            now: new Date(menuClock),
          })
        : null,
    [seller, menuRows, menuClock],
  );

  const sessionMenuLabel = useMemo(() => {
    if (activeMenu) {
      return String(activeMenu.name || activeMenu.menuName || 'Menu').trim() || 'Menu';
    }
    return 'All menus';
  }, [activeMenu]);

  const sessionProducts = useMemo(
    () => productsForStorefrontSession(activeMenu, menuRows, productRows),
    [activeMenu, menuRows, productRows],
  );

  const sessionCombosBase = useMemo(
    () => combosForStorefrontSession(activeMenu, menuRows, comboRows),
    [activeMenu, menuRows, comboRows],
  );

  const cuisineChips = useMemo(() => {
    const map = new Map();
    for (const p of sessionProducts) {
      const k = cuisineFilterKey(p);
      const lab = cuisineFilterLabel(p, globalCuisines);
      if (!lab) continue;
      if (!map.has(k)) map.set(k, lab);
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [sessionProducts, globalCuisines]);

  const menuChips = useMemo(() => {
    let rows = sessionProducts;
    if (quickCuisineKey) {
      rows = rows.filter((p) => cuisineFilterKey(p) === quickCuisineKey);
    }
    const map = new Map();
    for (const p of rows) {
      const k = menuFilterKey(p);
      const lab = menuFilterLabel(p, globalMenus);
      if (!lab) continue;
      if (!map.has(k)) map.set(k, lab);
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [sessionProducts, quickCuisineKey, globalMenus]);

  const browseProducts = useMemo(() => {
    let rows = sessionProducts;
    if (quickCuisineKey) {
      rows = rows.filter((p) => cuisineFilterKey(p) === quickCuisineKey);
    }
    if (quickMenuKey) {
      rows = rows.filter((p) => menuFilterKey(p) === quickMenuKey);
    }
    return rows;
  }, [sessionProducts, quickCuisineKey, quickMenuKey]);

  const browseCombos = useMemo(() => {
    const byId = new Map(productRows.map((p) => [p.id, p]));
    return sessionCombosBase.filter((c) => {
      const ids = normalizeComboProductIds(c);
      return ids.some((id) => {
        const p = byId.get(String(id).trim());
        if (!p) return false;
        if (quickCuisineKey && cuisineFilterKey(p) !== quickCuisineKey) return false;
        if (quickMenuKey && menuFilterKey(p) !== quickMenuKey) return false;
        return true;
      });
    });
  }, [sessionCombosBase, productRows, quickCuisineKey, quickMenuKey]);

  const quickCartTotal = useMemo(() => {
    let sum = 0;
    for (const [pidRaw, qRaw] of Object.entries(quickCartP)) {
      const pid = String(pidRaw).trim();
      const qty = Number(qRaw);
      if (!pid || !Number.isFinite(qty) || qty <= 0) continue;
      const p = productRows.find((x) => x.id === pid);
      const unit = p != null ? Number(p.price) : NaN;
      if (Number.isFinite(unit) && unit >= 0) sum += unit * qty;
    }
    for (const [cidRaw, qRaw] of Object.entries(quickCartC)) {
      const cid = String(cidRaw).trim();
      const qty = Number(qRaw);
      if (!cid || !Number.isFinite(qty) || qty <= 0) continue;
      const c = comboRows.find((x) => x.id === cid);
      const unit = c != null ? Number(c.price) : NaN;
      if (Number.isFinite(unit) && unit >= 0) sum += unit * qty;
    }
    return sum;
  }, [quickCartP, quickCartC, productRows, comboRows]);

  const filtered = useMemo(
    () => orders.filter((o) => orderMatchesTab(o, tab)),
    [orders, tab],
  );

  const openQuick = useCallback(() => {
    setQuickCuisineKey('');
    setQuickMenuKey('');
    setQuickCartP({});
    setQuickCartC({});
    setQuickOpen(true);
  }, []);
  const closeQuick = useCallback(() => {
    setQuickOpen(false);
    setQuickCartP({});
    setQuickCartC({});
  }, []);

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

  function bumpProductCart(id, delta) {
    setQuickCartP((prev) => {
      const cur = Number(prev[id]) || 0;
      const next = Math.max(0, cur + delta);
      const copy = { ...prev };
      if (next <= 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }

  function bumpComboCart(id, delta) {
    setQuickCartC((prev) => {
      const cur = Number(prev[id]) || 0;
      const next = Math.max(0, cur + delta);
      const copy = { ...prev };
      if (next <= 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }

  async function handleQuickOrder(e) {
    e.preventDefault();
    if (!sellerId || demoReadOnly) return;
    setActionError(null);
    setQuickBusy(true);
    try {
      const name = quickBuyerName.trim();
      const phone = quickBuyerPhone.trim();
      if (!name) throw new Error('Buyer name is required.');
      if (!phone) throw new Error('Buyer phone is required.');

      const items = [];
      for (const [pidRaw, qRaw] of Object.entries(quickCartP)) {
        const pid = String(pidRaw).trim();
        const qty = Number(qRaw);
        if (!pid || !Number.isFinite(qty) || qty <= 0) continue;
        const p = productRows.find((x) => x.id === pid);
        const unit = p != null ? Number(p.price) : NaN;
        if (!Number.isFinite(unit) || unit < 0) throw new Error('Invalid item selection.');
        const label = String(p.name ?? p.title ?? 'Item').trim() || 'Item';
        items.push({ productId: pid, name: label, qty, price: unit });
      }
      for (const [cidRaw, qRaw] of Object.entries(quickCartC)) {
        const cid = String(cidRaw).trim();
        const qty = Number(qRaw);
        if (!cid || !Number.isFinite(qty) || qty <= 0) continue;
        const c = comboRows.find((x) => x.id === cid);
        const unit = c != null ? Number(c.price) : NaN;
        if (!Number.isFinite(unit) || unit < 0) throw new Error('Invalid combo selection.');
        const label = String(c.name ?? c.title ?? 'Combo').trim() || 'Combo';
        items.push({ comboId: cid, name: label, qty, price: unit });
      }
      if (items.length === 0) {
        throw new Error('Add at least one item or combo from the menu below.');
      }

      const total = quickCartTotal;
      if (!Number.isFinite(total) || total <= 0) {
        throw new Error('Order total must be greater than zero.');
      }

      await createQuickOrder(sellerId, {
        buyerName: name,
        buyerPhone: phone,
        buyerAddress: quickAddress.trim() || undefined,
        items,
        total,
        paymentMode: quickPayment,
      });
      setQuickBuyerName('');
      setQuickBuyerPhone('');
      setQuickAddress('');
      setQuickCartP({});
      setQuickCartC({});
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

      <p className="muted orders-page-back" style={{ margin: 0, fontSize: '0.8125rem' }}>
        <Link to="/dashboard">← Back to dashboard</Link>
      </p>

      {!demoReadOnly ? (
        <button
          type="button"
          className="orders-quick-fab"
          onClick={openQuick}
          aria-haspopup="dialog"
          aria-expanded={quickOpen}
          aria-label="Quick order"
        >
          <Plus size={26} strokeWidth={2.25} aria-hidden />
        </button>
      ) : null}

      {quickOpen ? (
        <div className="orders-quick-overlay" role="presentation">
          <button
            type="button"
            className="orders-quick-overlay__backdrop"
            aria-label="Close quick order"
            onClick={closeQuick}
          />
          <div
            className="orders-quick-sheet orders-quick-sheet--browse card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="orders-quick-title"
          >
            <div className="orders-quick-sheet__head">
              <h2 id="orders-quick-title" style={{ margin: 0, fontSize: '1.1rem' }}>
                Quick order
              </h2>
              {!demoReadOnly ? (
                <button type="button" className="btn btn-ghost" onClick={closeQuick} aria-label="Close">
                  <X size={20} strokeWidth={2.1} aria-hidden />
                </button>
              ) : null}
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
                <div className="orders-quick-browse" role="region" aria-label="Pick items like your buyer menu">
                  <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem' }}>
                    Active menu session: <strong>{sessionMenuLabel}</strong>
                  </p>
                  <p
                    className="muted"
                    style={{
                      margin: '0.35rem 0 0.25rem',
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Cuisine
                  </p>
                  <div className="orders-quick-browse-tabs" role="tablist" aria-label="Cuisine filter">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!quickCuisineKey}
                      className={`orders-quick-browse-tab${!quickCuisineKey ? ' orders-quick-browse-tab--active' : ''}`}
                      onClick={() => {
                        setQuickCuisineKey('');
                        setQuickMenuKey('');
                      }}
                    >
                      All
                    </button>
                    {cuisineChips.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        role="tab"
                        aria-selected={quickCuisineKey === t.value}
                        className={`orders-quick-browse-tab${quickCuisineKey === t.value ? ' orders-quick-browse-tab--active' : ''}`}
                        onClick={() => {
                          setQuickCuisineKey(t.value);
                          setQuickMenuKey('');
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <p
                    className="muted"
                    style={{
                      margin: '0.65rem 0 0.25rem',
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Menu category
                  </p>
                  <div className="orders-quick-browse-tabs" role="tablist" aria-label="Menu category filter">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!quickMenuKey}
                      className={`orders-quick-browse-tab${!quickMenuKey ? ' orders-quick-browse-tab--active' : ''}`}
                      onClick={() => setQuickMenuKey('')}
                    >
                      All
                    </button>
                    {menuChips.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        role="tab"
                        aria-selected={quickMenuKey === t.value}
                        className={`orders-quick-browse-tab${quickMenuKey === t.value ? ' orders-quick-browse-tab--active' : ''}`}
                        onClick={() => setQuickMenuKey(t.value)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="orders-quick-browse-scroll">
                    <h3 className="orders-quick-browse-heading">Items</h3>
                    <ul className="orders-quick-menu-grid">
                      {browseProducts.map((p) => {
                        const img =
                          typeof p.imageUrl === 'string' && p.imageUrl.trim()
                            ? p.imageUrl.trim()
                            : typeof p.image === 'string' && p.image.trim()
                              ? p.image.trim()
                              : '';
                        const unit = Number(p.price);
                        const q = Number(quickCartP[p.id]) || 0;
                        return (
                          <li key={p.id}>
                            <article className="orders-quick-menu-card">
                              <div className="orders-quick-menu-card__media">
                                {img ? <img src={img} alt="" loading="lazy" /> : <span className="muted">No image</span>}
                              </div>
                              <div className="orders-quick-menu-card__body">
                                <p className="orders-quick-menu-card__name">{browseProductName(p)}</p>
                                <p className="orders-quick-menu-card__price">{formatRupee(Number.isFinite(unit) ? unit : null)}</p>
                                <div className="orders-quick-menu-card__qty">
                                  <button type="button" className="btn btn-ghost btn--sm" onClick={() => bumpProductCart(p.id, -1)}>
                                    −
                                  </button>
                                  <span className="orders-quick-menu-card__qty-val">{q}</span>
                                  <button type="button" className="btn btn-ghost btn--sm" onClick={() => bumpProductCart(p.id, 1)}>
                                    +
                                  </button>
                                </div>
                              </div>
                            </article>
                          </li>
                        );
                      })}
                    </ul>
                    <h3 className="orders-quick-browse-heading">Combos</h3>
                    <ul className="orders-quick-menu-grid">
                      {browseCombos.map((c) => {
                        const unit = Number(c.price);
                        const q = Number(quickCartC[c.id]) || 0;
                        return (
                          <li key={c.id}>
                            <article className="orders-quick-menu-card">
                              <div className="orders-quick-menu-card__body">
                                <p className="orders-quick-menu-card__name">{browseComboName(c)}</p>
                                <p className="orders-quick-menu-card__price">{formatRupee(Number.isFinite(unit) ? unit : null)}</p>
                                <div className="orders-quick-menu-card__qty">
                                  <button type="button" className="btn btn-ghost btn--sm" onClick={() => bumpComboCart(c.id, -1)}>
                                    −
                                  </button>
                                  <span className="orders-quick-menu-card__qty-val">{q}</span>
                                  <button type="button" className="btn btn-ghost btn--sm" onClick={() => bumpComboCart(c.id, 1)}>
                                    +
                                  </button>
                                </div>
                              </div>
                            </article>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
                <div className="orders-quick-row orders-quick-row--total">
                  <p className="orders-quick-total-line" style={{ margin: 0 }}>
                    <span className="orders-quick-label">Total</span>{' '}
                    <strong className="orders-quick-total-amt">{formatRupee(quickCartTotal)}</strong>
                  </p>
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
