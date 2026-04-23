import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CustomerCard } from '../components/CustomerCard';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useSeller } from '../hooks/useSeller';
import { reverseGeocodeLatLng } from '../services/geocode';
import {
  aggregateCustomersFromOrders,
  buildUserIndexes,
  customerMatchesSearch,
  formatMonthYear,
  matchesCustomerFilter,
  resolveCustomerProfile,
  shortenAddressLabel,
  sortCustomers,
} from '../services/customerService';
import { subscribeOrdersBySellerId, subscribeUsersCollection } from '../services/firestore';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'frequent', label: 'Frequent' },
  { id: 'premium', label: 'Premium' },
  { id: 'vip', label: 'VIP' },
];

const SORTS = [
  { id: 'recent', label: 'Recent' },
  { id: 'spent', label: 'Highest spent' },
  { id: 'orders', label: 'Most orders' },
];

export function Customers() {
  const { seller, sellerId, loading: sellerLoading, error: sellerError } = useSeller();
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('recent');
  const [locByRoute, setLocByRoute] = useState({});

  useEffect(() => {
    if (!sellerId) {
      setOrders([]);
      setLoading(false);
      setError(null);
      return undefined;
    }
    setLoading(true);
    setError(null);
    const unsub = subscribeOrdersBySellerId(
      sellerId,
      (rows) => {
        setOrders(rows);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setOrders([]);
        setLoading(false);
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

  const profiles = useMemo(() => {
    const aggs = aggregateCustomersFromOrders(orders);
    return sortCustomers(
      aggs
        .map((a) => {
          const p = resolveCustomerProfile(a, indexes);
          return {
            ...p,
            sinceLabel: formatMonthYear(p.firstOrderMs),
          };
        })
        .filter((p) => matchesCustomerFilter(p, tab))
        .filter((p) => customerMatchesSearch(p, debouncedSearch)),
      sort,
    );
  }, [orders, indexes, tab, debouncedSearch, sort]);

  useEffect(() => {
    const aggs = aggregateCustomersFromOrders(orders);
    const base = aggs.map((a) => resolveCustomerProfile(a, indexes));
    if (base.length === 0) {
      setLocByRoute({});
      return undefined;
    }
    let cancelled = false;
    const ctrl = new AbortController();

    (async () => {
      const next = {};
      for (const p of base) {
        const id = p.routeId;
        if (p.addressStr) {
          next[id] = shortenAddressLabel(p.addressStr);
          continue;
        }
        if (!p.latLng) continue;
        try {
          const label = await reverseGeocodeLatLng(
            p.latLng.lat,
            p.latLng.lng,
            ctrl.signal,
          );
          if (label) next[id] = label;
        } catch {
          /* aborted */
        }
      }
      if (!cancelled) setLocByRoute(next);
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [orders, indexes]);

  if (sellerLoading) {
    return (
      <div className="customers-page card">
        <p className="muted" style={{ margin: 0 }}>
          Loading…
        </p>
      </div>
    );
  }

  if (sellerError) {
    return (
      <div className="customers-page card stack">
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
      <div className="customers-page card stack">
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Customers</h1>
        <p className="muted" style={{ margin: 0 }}>
          Set up your shop first.
        </p>
        <Link to="/onboarding" className="btn btn-primary">
          Set up shop
        </Link>
      </div>
    );
  }

  return (
    <div className="customers-page customers-page--premium">
      <header className="customers-page-header customers-page-header--premium">
        <h1 style={{ margin: 0, fontSize: '1.35rem', letterSpacing: '-0.02em' }}>
          Customers
        </h1>
      </header>

      <div className="customers-toolbar card">
        <label className="customers-search">
          <span className="sr-only">Search</span>
          <input
            className="input customers-search__input"
            placeholder="Search name, mobile, or order count…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </label>

        <div className="customers-tabs" role="tablist" aria-label="Customer tier">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`customers-tab${tab === t.id ? ' customers-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="customers-sort">
          <span className="muted customers-sort__label">Sort</span>
          <select
            className="input customers-sort__select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort customers"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <p className="error" style={{ margin: 0 }}>
          {error.message ?? 'Could not load orders.'}
        </p>
      ) : null}

      {loading ? (
        <p className="muted" style={{ margin: 0 }}>
          Loading customers…
        </p>
      ) : orders.length === 0 ? (
        <div className="card customers-page-empty customers-page-empty--premium">
          <p className="muted" style={{ margin: 0 }}>
            No orders yet — customer list builds from order history.
          </p>
        </div>
      ) : profiles.length === 0 ? (
        <div className="card customers-page-empty customers-page-empty--premium">
          <p className="muted" style={{ margin: 0 }}>
            No customers match — try another tab or search.
          </p>
        </div>
      ) : (
        <ul className="customers-premium-grid">
          {profiles.map((p) => (
            <li key={p.routeId}>
              <CustomerCard profile={p} locationLabel={locByRoute[p.routeId]} />
            </li>
          ))}
        </ul>
      )}

      <p className="muted" style={{ margin: '1rem 0 0', fontSize: '0.8125rem' }}>
        <Link to="/dashboard">← Back to dashboard</Link>
      </p>
    </div>
  );
}
