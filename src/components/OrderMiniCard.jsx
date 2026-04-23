import { useNavigate } from 'react-router-dom';
import {
  formatOrderDateTimeParts,
  getOrderMonetaryTotal,
  lineItemCount,
} from '../services/customerService';

function shortId(id) {
  const s = String(id ?? '');
  if (s.length <= 10) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function OrderMiniCard({ order }) {
  const nav = useNavigate();
  const { date, time } = formatOrderDateTimeParts(order);
  const items = lineItemCount(order) || 0;
  const total = getOrderMonetaryTotal(order);

  function go() {
    nav(`/orders/${encodeURIComponent(order.id)}`);
  }

  return (
    <button type="button" className="order-mini-card order-mini-card--square" onClick={go}>
      <span className="order-mini-card__id-label">order id</span>
      <span className="order-mini-card__id">{shortId(order.id)}</span>

      <div className="order-mini-card__mid">
        <span className="order-mini-card__total">₹{total.toLocaleString('en-IN')}</span>
        <span className="order-mini-card__items">{items} Items</span>
      </div>

      <div className="order-mini-card__bottom">
        <span className="order-mini-card__date">{date}</span>
        <span className="order-mini-card__time">{time}</span>
      </div>
    </button>
  );
}
