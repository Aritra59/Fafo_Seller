import { memo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, IndianRupee, Package } from 'lucide-react';

function badgeClass(badge) {
  const b = String(badge ?? 'NEW').toLowerCase();
  if (b === 'new') return 'customer-premium-card__badge customer-premium-card__badge--new';
  if (b === 'frequent') return 'customer-premium-card__badge customer-premium-card__badge--frequent';
  if (b === 'premium') return 'customer-premium-card__badge customer-premium-card__badge--premium';
  if (b === 'vip') return 'customer-premium-card__badge customer-premium-card__badge--vip';
  return 'customer-premium-card__badge';
}

function formatRupee(n) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export const CustomerCard = memo(function CustomerCard({ profile }) {
  const { routeId, name, photoUrl, badge, totalOrders, totalSpent, displayPhone } = profile;

  const initial = String(name || 'C').trim().charAt(0).toUpperCase() || 'C';
  const since = profile.sinceLabel ?? '—';
  const phone = displayPhone || '—';

  return (
    <Link to={`/customers/${encodeURIComponent(routeId)}`} className="customer-premium-card">
      <div className="customer-premium-card__top">
        <div className="customer-premium-card__avatar-wrap">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="customer-premium-card__avatar-img"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="customer-premium-card__avatar-letter" aria-hidden>
              {initial}
            </span>
          )}
        </div>
        <span className={badgeClass(badge)}>{badge}</span>
      </div>

      <p className="customer-premium-card__name">{name}</p>
      <p className="customer-premium-card__phone muted" style={{ margin: '0.15rem 0 0' }}>
        {phone}
      </p>

      <div className="customer-premium-card__stats">
        <span className="customer-premium-card__stat">
          <Package
            className="customer-premium-card__icon-lucide customer-premium-card__icon-lucide--orders"
            size={15}
            strokeWidth={2.25}
            aria-hidden
          />
          <span className="customer-premium-card__stat-label">Orders:</span>
          <span className="customer-premium-card__stat-value">{totalOrders}</span>
        </span>
        <span className="customer-premium-card__stat">
          <IndianRupee
            className="customer-premium-card__icon-lucide customer-premium-card__icon-lucide--total"
            size={15}
            strokeWidth={2.25}
            aria-hidden
          />
          <span className="customer-premium-card__stat-label">Total:</span>
          <span className="customer-premium-card__stat-rupee">{formatRupee(totalSpent)}</span>
        </span>
      </div>

      <div className="customer-premium-card__lower">
        <p className="customer-premium-card__since">
          <CalendarDays
            className="customer-premium-card__icon-lucide customer-premium-card__icon-lucide--since"
            size={14}
            strokeWidth={2.1}
            aria-hidden
          />
          <span className="customer-premium-card__since-label">Since:</span>
          <span className="customer-premium-card__since-val">{since}</span>
        </p>
      </div>
    </Link>
  );
});
