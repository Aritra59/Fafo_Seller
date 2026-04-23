import { Link } from 'react-router-dom';
import { getOrderMonetaryTotal } from '../services/customerService';

function normalizeStatus(status) {
  return String(status ?? '').trim().toLowerCase();
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

function formatRupee(n) {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatTs(ts) {
  if (ts == null) return '—';
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
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

export function OrderDetailsModal({ order, onClose }) {
  if (!order) return null;

  const lines = normalizeLineItems(order);
  const total = getOrderMonetaryTotal(order);
  const addr =
    typeof order.buyerAddress === 'string' && order.buyerAddress.trim()
      ? order.buyerAddress.trim()
      : typeof order.address === 'string' && order.address.trim()
        ? order.address.trim()
        : '';
  const payMode = String(order.paymentMode ?? order.payment ?? '—').trim() || '—';
  const st = normalizeStatus(order.status);
  const created = formatTs(order.createdAt);
  const updated = formatTs(order.updatedAt);
  const notes =
    typeof order.notes === 'string' && order.notes.trim()
      ? order.notes.trim()
      : typeof order.note === 'string' && order.note.trim()
        ? order.note.trim()
        : '';

  return (
    <div className="order-detail-overlay" role="dialog" aria-modal="true" aria-label="Order details">
      <button
        type="button"
        className="order-detail-overlay__backdrop"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="order-detail-sheet card">
        <header className="order-detail-sheet__head">
          <div>
            <p className="order-detail-sheet__eyebrow">Order ID</p>
            <p className="order-detail-sheet__id" title={order.id}>
              {order.id}
            </p>
          </div>
          <button type="button" className="btn btn-ghost order-detail-sheet__close" onClick={onClose}>
            ✕
          </button>
        </header>

        <p className="order-detail-sheet__status">
          Status: <strong>{st || '—'}</strong>
        </p>

        <section className="order-detail-sheet__block">
          <h3 className="order-detail-sheet__h">Items</h3>
          <ul className="order-detail-items">
            {lines.map((line, idx) => (
              <li key={`${order.id}-l-${idx}`} className="order-detail-items__row">
                <span>{line.name}</span>
                <span className="muted">×{line.quantity}</span>
                <span>{line.lineTotal != null ? formatRupee(line.lineTotal) : '—'}</span>
              </li>
            ))}
          </ul>
          <p className="order-detail-sheet__total">
            Total <strong>{formatRupee(total)}</strong>
          </p>
        </section>

        <section className="order-detail-sheet__block">
          <h3 className="order-detail-sheet__h">Buyer</h3>
          <p style={{ margin: 0 }}>
            {buyerDisplayName(order) || 'Customer'} · {buyerPhone(order)}
          </p>
          {addr ? (
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.875rem' }}>
              {addr}
            </p>
          ) : null}
        </section>

        <section className="order-detail-sheet__block">
          <h3 className="order-detail-sheet__h">Status timeline</h3>
          <ul className="order-detail-timeline">
            <li>
              <span className="order-detail-timeline__dot" aria-hidden />
              <div>
                <strong>Created</strong>
                <span className="muted">{created}</span>
              </div>
            </li>
            <li>
              <span className="order-detail-timeline__dot" aria-hidden />
              <div>
                <strong>Current · {st || '—'}</strong>
                <span className="muted">Last update {updated}</span>
              </div>
            </li>
          </ul>
        </section>

        <dl className="order-detail-meta">
          <div>
            <dt>Payment</dt>
            <dd>{payMode}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{created}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{updated}</dd>
          </div>
          {notes ? (
            <div className="order-detail-meta__full">
              <dt>Notes</dt>
              <dd>{notes}</dd>
            </div>
          ) : null}
        </dl>

        <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
          <Link to="/orders" onClick={onClose}>
            ← Back to orders
          </Link>
        </p>
      </div>
    </div>
  );
}
