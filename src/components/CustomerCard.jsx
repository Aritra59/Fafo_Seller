import { Link } from 'react-router-dom';
import { shortenAddressLabel } from '../services/customerService';

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

export function CustomerCard({ profile, locationLabel }) {
  const {
    routeId,
    name,
    photoUrl,
    badge,
    totalOrders,
    totalSpent,
    addressStr,
  } = profile;

  const initial = String(name || 'C').trim().charAt(0).toUpperCase() || 'C';
  const since = profile.sinceLabel ?? '—';
  const loc = locationLabel || shortenAddressLabel(addressStr) || '—';

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

      <div className="customer-premium-card__stats">
        <span className="customer-premium-card__stat">
          <span className="customer-premium-card__stat-icon customer-premium-card__stat-icon--orders" aria-hidden />
          <span className="customer-premium-card__stat-label">Orders:</span>
          <span className="customer-premium-card__stat-value">{totalOrders}</span>
        </span>
        <span className="customer-premium-card__stat">
          <span className="customer-premium-card__stat-icon customer-premium-card__stat-icon--total" aria-hidden />
          <span className="customer-premium-card__stat-label">Total:</span>
          <span className="customer-premium-card__stat-rupee">{formatRupee(totalSpent)}</span>
        </span>
      </div>

      <div className="customer-premium-card__lower">
        <p className="customer-premium-card__loc">
          <span className="customer-premium-card__pin" aria-hidden />
          {loc}
        </p>
        <p className="customer-premium-card__since">
          <span className="customer-premium-card__cal" aria-hidden />
          <span className="customer-premium-card__since-label">Since:</span>
          <span className="customer-premium-card__since-val">{since}</span>
        </p>
      </div>
    </Link>
  );
}
