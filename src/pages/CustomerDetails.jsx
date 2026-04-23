import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { OrderMiniCard } from '../components/OrderMiniCard';
import { useSeller } from '../hooks/useSeller';
import { reverseGeocodeLatLng } from '../services/geocode';
import {
  aggregateCustomersFromOrders,
  buildUserIndexes,
  findCustomerByRouteId,
  formatMonthYear,
  getOrderMonetaryTotal,
  phoneKeyFromOrder,
  buyerIdFromOrder,
  resolveCustomerProfile,
} from '../services/customerService';
import { subscribeOrdersBySellerId, subscribeUsersCollection } from '../services/firestore';

function badgeClass(badge) {
  const b = String(badge ?? 'NEW').toLowerCase();
  if (b === 'new') return 'customer-detail-badge customer-detail-badge--new';
  if (b === 'frequent') return 'customer-detail-badge customer-detail-badge--frequent';
  if (b === 'premium') return 'customer-detail-badge customer-detail-badge--premium';
  if (b === 'vip') return 'customer-detail-badge customer-detail-badge--vip';
  return 'customer-detail-badge';
}

function formatRupee(n) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatDateTime(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  try {
    return new Date(ms).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function openWhatsApp(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return;
  window.open(`https://wa.me/${digits}`, '_blank', 'noopener,noreferrer');
}

function openCall(phone) {
  const raw = String(phone ?? '').trim();
  if (!raw) return;
  if (raw.startsWith('+')) {
    window.location.href = `tel:${encodeURIComponent(raw)}`;
    return;
  }
  const digits = raw.replace(/\D/g, '');
  if (digits) window.location.href = `tel:+${digits}`;
}

function orderBelongsToProfile(order, profile) {
  const bid = buyerIdFromOrder(order);
  if (profile.buyerId && bid && bid === profile.buyerId) return true;
  const pk = phoneKeyFromOrder(order);
  if (profile.phoneDigits && pk === profile.phoneDigits) return true;
  return false;
}

export function CustomerDetails() {
  const { customerId } = useParams();
  const { seller, sellerId, loading: sellerLoading, error: sellerError } = useSeller();
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [ordersErr, setOrdersErr] = useState(null);
  const [locLabel, setLocLabel] = useState('');

  useEffect(() => {
    if (!sellerId) {
      setOrders([]);
      return undefined;
    }
    const unsub = subscribeOrdersBySellerId(
      sellerId,
      (rows) => {
        setOrders(rows);
        setOrdersErr(null);
      },
      (e) => {
        setOrdersErr(e);
        setOrders([]);
      },
    );
    return () => unsub();
  }, [sellerId]);

  useEffect(() => {
    const unsub = subscribeUsersCollection(
      (rows) => setUsers(rows),
      () => setUsers([]),
    );
    return () => unsub();
  }, []);

  const indexes = useMemo(() => buildUserIndexes(users), [users]);

  const profile = useMemo(() => {
    const aggs = aggregateCustomersFromOrders(orders);
    const mapped = aggs.map((a) => resolveCustomerProfile(a, indexes));
    const seg = decodeURIComponent(String(customerId ?? ''));
    return findCustomerByRouteId(mapped, seg) || null;
  }, [orders, indexes, customerId]);

  const customerOrders = useMemo(() => {
    if (!profile) return [];
    return orders.filter((o) => orderBelongsToProfile(o, profile));
  }, [orders, profile]);

  const historyTotal = useMemo(() => {
    let s = 0;
    for (const o of customerOrders) {
      s += getOrderMonetaryTotal(o);
    }
    return s;
  }, [customerOrders]);

  const rangeLabel = useMemo(() => {
    if (customerOrders.length === 0) return '—';
    const oldest = customerOrders[customerOrders.length - 1];
    const newest = customerOrders[0];
    const fmt = (o) => {
      const ts = o?.createdAt;
      if (ts?.toDate) {
        try {
          return ts.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
        } catch {
          return '';
        }
      }
      return '';
    };
    const a = fmt(oldest);
    const b = fmt(newest);
    return a && b ? `${a} to ${b}` : '—';
  }, [customerOrders]);

  useEffect(() => {
    if (!profile) {
      setLocLabel('');
      return undefined;
    }
    if (profile.addressStr) {
      setLocLabel(profile.addressStr.split(',').slice(0, 2).join(',').trim());
      return undefined;
    }
    const ll = profile.latLng;
    if (!ll) {
      setLocLabel('');
      return undefined;
    }
    let cancelled = false;
    reverseGeocodeLatLng(ll.lat, ll.lng)
      .then((label) => {
        if (!cancelled) setLocLabel(label || '');
      })
      .catch(() => {
        if (!cancelled) setLocLabel('');
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const since = profile ? formatMonthYear(profile.firstOrderMs) : '—';
  const aov =
    profile && profile.totalOrders > 0
      ? profile.totalSpent / profile.totalOrders
      : 0;
  const initial = profile
    ? String(profile.name || 'C')
        .trim()
        .charAt(0)
        .toUpperCase() || 'C'
    : '—';

  if (sellerLoading) {
    return (
      <div className="customer-detail-page card">
        <p className="muted" style={{ margin: 0 }}>
          Loading…
        </p>
      </div>
    );
  }

  if (sellerError) {
    return (
      <div className="customer-detail-page card stack">
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
      <div className="customer-detail-page card stack">
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Customer</h1>
        <p className="muted" style={{ margin: 0 }}>
          Set up your shop first.
        </p>
        <Link to="/onboarding" className="btn btn-primary">
          Set up shop
        </Link>
      </div>
    );
  }

  if (ordersErr) {
    return (
      <div className="customer-detail-page card">
        <p className="error">{ordersErr.message ?? 'Could not load orders.'}</p>
        <Link to="/customers">← Customers</Link>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="customer-detail-page card stack">
        <p className="muted">Customer not found.</p>
        <Link to="/customers" className="btn btn-primary">
          Back to customers
        </Link>
      </div>
    );
  }

  return (
    <div className="customer-detail-page">
      <header className="customer-detail-page__head">
        <Link to="/customers" className="customer-detail-back muted">
          ← Customers
        </Link>
        <h1 className="customer-detail-page__title">Customer details</h1>
      </header>

      <section className="customer-detail-hero card">
        <div className="customer-detail-hero__top">
          <div className="customer-detail-hero__avatar-wrap">
            {profile.photoUrl ? (
              <img
                src={profile.photoUrl}
                alt=""
                className="customer-detail-hero__avatar-img"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="customer-detail-hero__avatar-letter" aria-hidden>
                {initial}
              </span>
            )}
          </div>
          <div className="customer-detail-hero__meta">
            <div className="customer-detail-hero__name-row">
              <h2 className="customer-detail-hero__name">{profile.name}</h2>
              <span className={badgeClass(profile.badge)}>{profile.badge}</span>
            </div>
            <p className="customer-detail-hero__phone">{profile.displayPhone}</p>
            {locLabel ? (
              <p className="customer-detail-hero__loc muted">{locLabel}</p>
            ) : null}
          </div>
        </div>

        <dl className="customer-detail-stats">
          <div>
            <dt>Total orders</dt>
            <dd>{profile.totalOrders}</dd>
          </div>
          <div>
            <dt>Total spend</dt>
            <dd className="customer-detail-stats__green">{formatRupee(profile.totalSpent)}</dd>
          </div>
          <div>
            <dt>Since</dt>
            <dd>{since}</dd>
          </div>
          <div>
            <dt>Last order</dt>
            <dd>{formatDateTime(profile.lastOrderMs)}</dd>
          </div>
          <div>
            <dt>Avg order</dt>
            <dd>{profile.totalOrders > 0 ? formatRupee(aov) : '—'}</dd>
          </div>
        </dl>

        <div className="customer-detail-actions">
          <button
            type="button"
            className="btn btn-ghost customer-detail-actions__wa"
            onClick={() => openWhatsApp(profile.displayPhone)}
          >
            WhatsApp
          </button>
          <button
            type="button"
            className="btn btn-primary customer-detail-actions__call"
            onClick={() => openCall(profile.displayPhone)}
          >
            Call
          </button>
        </div>
      </section>

      <section className="customer-detail-history" aria-labelledby="cust-orders-title">
        <h2 id="cust-orders-title" className="customer-detail-history__title">
          Order history
        </h2>
        <ul className="order-mini-grid order-mini-grid--square">
          {customerOrders.map((o) => (
            <li key={o.id}>
              <OrderMiniCard order={o} />
            </li>
          ))}
        </ul>

        {customerOrders.length > 0 ? (
          <div className="order-history-summary card">
            <div className="order-history-summary__row">
              <span className="muted">Total Value</span>
              <span className="muted order-history-summary__range">{rangeLabel}</span>
            </div>
            <div className="order-history-summary__row order-history-summary__row--main">
              <span className="order-history-summary__amount">{formatRupee(historyTotal)}</span>
              <span className="order-history-summary__dl-icon" aria-hidden title="Export coming soon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M12 3v12m0 0l4-4m-4 4l-4-4M4 21h16"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
          </div>
        ) : (
          <p className="muted">No orders for this customer yet.</p>
        )}
      </section>
    </div>
  );
}
