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
  const { routeId, name, photoUrl, badge, totalOrders, totalSpent } = profile;

  const initial = String(name || 'C').trim().charAt(0).toUpperCase() || 'C';
  const since = profile.sinceLabel ?? '—';

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

      <p className="customer-premium-card__name" title={name || undefined}>
        {name}
      </p>

      <div className="customer-premium-card__stats" aria-label="Order totals">
        <p className="customer-premium-card__stat customer-premium-card__stat--orders">
          <Package
            className="customer-premium-card__lucide customer-premium-card__lucide--package"
            size={16}
            strokeWidth={2.25}
            aria-hidden
          />
          <span className="customer-premium-card__stat-inner">
            <span className="customer-premium-card__lbl">Orders: </span>
            <span className="customer-premium-card__num">{totalOrders}</span>
          </span>
        </p>
        <p className="customer-premium-card__stat customer-premium-card__stat--total">
          <IndianRupee
            className="customer-premium-card__lucide customer-premium-card__lucide--rupee"
            size={16}
            strokeWidth={2.25}
            aria-hidden
          />
          <span className="customer-premium-card__stat-inner">
            <span className="customer-premium-card__lbl">Total: </span>
            <span className="customer-premium-card__amt">{formatRupee(totalSpent)}</span>
          </span>
        </p>
      </div>

      <div className="customer-premium-card__foot">
        <p className="customer-premium-card__stat customer-premium-card__stat--since" title={since && since !== '—' ? `Since ${since}` : undefined}>
          <CalendarDays
            className="customer-premium-card__lucide customer-premium-card__lucide--since"
            size={15}
            strokeWidth={2.1}
            aria-hidden
          />
          <span className="customer-premium-card__stat-inner">
            <span className="customer-premium-card__lbl">Since: </span>
            <span className="customer-premium-card__date">{since}</span>
          </span>
        </p>
      </div>
    </Link>
  );
});
