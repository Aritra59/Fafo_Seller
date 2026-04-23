/**
 * Customer aggregation + profile resolution for the seller Customers module.
 */

/** Orders that count toward spend, order count, and CRM tiers. */
export const QUALIFYING_ORDER_STATUSES = new Set([
  'confirmed',
  'preparing',
  'ready',
  'completed',
  'delivered',
]);

function normalizeStatus(status) {
  return String(status ?? '').trim().toLowerCase();
}

function isQualifyingOrder(order) {
  return QUALIFYING_ORDER_STATUSES.has(normalizeStatus(order.status));
}

export function normalizePhoneDigits(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits || '';
}

export function phoneKeyFromOrder(order) {
  const raw =
    order.buyerPhone ??
    order.phone ??
    order.customerPhone ??
    order.buyer?.phone ??
    '';
  const digits = normalizePhoneDigits(raw);
  return digits || String(raw).trim() || 'unknown';
}

export function buyerIdFromOrder(order) {
  const id =
    order.buyerId ??
    order.buyerUid ??
    order.userId ??
    order.uid ??
    order.customerId ??
    '';
  return typeof id === 'string' && id.trim() ? id.trim() : '';
}

/**
 * Stable route key: prefer Firebase user id, else phone digits.
 */
export function customerRouteIdFromParts({ buyerId, phoneDigits }) {
  if (buyerId) {
    return `u-${buyerId}`;
  }
  const p = normalizePhoneDigits(phoneDigits);
  return p ? `p-${p}` : 'p-unknown';
}

export function parseCustomerRouteId(segment) {
  const s = String(segment ?? '').trim();
  if (s.startsWith('u-')) {
    return { type: 'uid', buyerId: s.slice(2), phoneDigits: '' };
  }
  if (s.startsWith('p-')) {
    return { type: 'phone', buyerId: '', phoneDigits: s.slice(2) };
  }
  return { type: 'unknown', buyerId: '', phoneDigits: '' };
}

/**
 * Build O(1) lookups from subscribed `users` rows.
 */
export function buildUserIndexes(userRows) {
  const byId = new Map();
  const byPhoneDigits = new Map();
  for (const u of userRows) {
    const id = String(u.id ?? '').trim();
    if (id) byId.set(id, u);
    const pd = normalizePhoneDigits(u.phone ?? u.phoneNumber ?? '');
    if (pd) {
      byPhoneDigits.set(pd, u);
    }
  }
  return { byId, byPhoneDigits };
}

export function orderCreatedMs(order) {
  const ts = order.createdAt;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

export function getOrderMonetaryTotal(order) {
  const v = order.totalAmount ?? order.total ?? order.amount;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function lineItemCount(order) {
  const raw = order.items ?? order.lineItems ?? order.lines;
  if (!Array.isArray(raw) || raw.length === 0) return 0;
  let n = 0;
  for (const line of raw) {
    const qty = line.quantity ?? line.qty ?? 1;
    const q = Number(qty);
    n += Number.isFinite(q) && q > 0 ? q : 1;
  }
  return n;
}

/** Badge from qualifying order count (spec). */
export function badgeFromOrderCount(qualifyingCount) {
  const n = Number(qualifyingCount) || 0;
  if (n <= 2) return 'NEW';
  if (n <= 10) return 'FREQUENT';
  if (n <= 25) return 'PREMIUM';
  return 'VIP';
}

function nameFromOrderFallback(order) {
  const n =
    order.buyerName ??
    order.customerName ??
    order.buyer?.name ??
    order.name ??
    '';
  return typeof n === 'string' && n.trim() ? n.trim() : '';
}

function pickBestName(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

function photoFromUser(u) {
  const p =
    u.photoUrl ?? u.photoURL ?? u.avatarUrl ?? u.photo ?? '';
  return typeof p === 'string' && p.trim() ? p.trim() : '';
}

function addressFromUser(u) {
  const a = u.address ?? u.deliveryAddress ?? '';
  if (typeof a === 'string' && a.trim()) return a.trim();
  return '';
}

function latLngFromUser(u) {
  const tryPair = (lat, lng) => {
    const lt = Number(lat);
    const lg = Number(lng);
    if (Number.isFinite(lt) && Number.isFinite(lg)) return { lat: lt, lng: lg };
    return null;
  };
  const loc = u.location ?? u.savedLocation;
  if (loc && typeof loc === 'object') {
    if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      return tryPair(loc.lat, loc.lng);
    }
    if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      return tryPair(loc.latitude, loc.longitude);
    }
  }
  return null;
}

function createdAtMsFromUser(u) {
  const ts = u.createdAt;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  return null;
}

/**
 * Resolve display fields for one logical customer (by aggregate key).
 */
export function resolveCustomerProfile(
  agg,
  { byId, byPhoneDigits },
) {
  let user = null;
  if (agg.buyerId && byId.has(agg.buyerId)) {
    user = byId.get(agg.buyerId);
  } else if (agg.phoneDigits && byPhoneDigits.has(agg.phoneDigits)) {
    user = byPhoneDigits.get(agg.phoneDigits);
  }

  const fromOrdersName = pickBestName(...agg.fallbackNamesFromOrders.map(String));
  const name = pickBestName(
    user?.name,
    user?.displayName,
    fromOrdersName,
  ) || 'Customer';

  const photoUrl = user ? photoFromUser(user) : '';
  const addressStr = user ? addressFromUser(user) : '';
  const latLng = user ? latLngFromUser(user) : null;
  const userCreatedMs = user ? createdAtMsFromUser(user) : null;

  const displayPhone =
    agg.displayPhone ||
    (agg.phoneDigits ? `+${agg.phoneDigits}` : '') ||
    '—';

  const mergedBuyerId = agg.buyerId || user?.userId || user?.id || '';

  const routeId = customerRouteIdFromParts({
    buyerId: mergedBuyerId,
    phoneDigits: agg.phoneDigits,
  });

  return {
    ...agg,
    buyerId: mergedBuyerId,
    routeId,
    name,
    photoUrl,
    addressStr,
    latLng,
    userCreatedMs,
    displayPhone,
    badge: badgeFromOrderCount(agg.qualifyingCount),
    totalSpent: agg.qualifyingSpent,
    totalOrders: agg.qualifyingCount,
  };
}

/**
 * Group seller orders into customer aggregates (one pass).
 */
export function aggregateCustomersFromOrders(orders) {
  /** @type {Map<string, object>} */
  const map = new Map();

  function bucketKey(order) {
    const bid = buyerIdFromOrder(order);
    if (bid) return { key: `uid:${bid}`, buyerId: bid, phoneDigits: normalizePhoneDigits(phoneKeyFromOrder(order)) };
    const pk = phoneKeyFromOrder(order);
    return { key: `ph:${pk}`, buyerId: '', phoneDigits: pk };
  }

  for (const order of orders) {
    const { key, buyerId, phoneDigits } = bucketKey(order);
    if (!map.has(key)) {
      const rawPhone =
        order.buyerPhone ??
        order.phone ??
        order.customerPhone ??
        order.buyer?.phone ??
        '';
      map.set(key, {
        key,
        buyerId,
        phoneDigits,
        displayPhone: typeof rawPhone === 'string' && rawPhone.trim() ? rawPhone.trim() : '',
        fallbackNamesFromOrders: [],
        qualifyingCount: 0,
        qualifyingSpent: 0,
        firstOrderMs: null,
        lastOrderMs: null,
        ordersChronological: [],
      });
    }
    const row = map.get(key);
    const nm = nameFromOrderFallback(order);
    if (nm) row.fallbackNamesFromOrders.push(nm);

    const ms = orderCreatedMs(order);
    if (row.firstOrderMs == null || ms < row.firstOrderMs) row.firstOrderMs = ms;
    if (row.lastOrderMs == null || ms > row.lastOrderMs) row.lastOrderMs = ms;

    row.ordersChronological.push(order);

    if (isQualifyingOrder(order)) {
      row.qualifyingCount += 1;
      row.qualifyingSpent += getOrderMonetaryTotal(order);
    }
  }

  for (const row of map.values()) {
    row.ordersChronological.sort(
      (a, b) => orderCreatedMs(b) - orderCreatedMs(a),
    );
  }

  return [...map.values()];
}

/**
 * Short multi-line location for cards: "Area, City" from a long address string.
 */
export function shortenAddressLabel(address) {
  const s = String(address ?? '').trim();
  if (!s) return '';
  const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}, ${parts[1]}`;
  }
  return parts[0] ?? s;
}

export function formatMonthYear(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  try {
    return new Date(ms).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

export function matchesCustomerFilter(profile, tabId) {
  if (tabId === 'all') return true;
  const b = String(profile.badge ?? '').toLowerCase();
  return b === String(tabId).toLowerCase();
}

export function customerMatchesSearch(profile, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  if (profile.name.toLowerCase().includes(q)) return true;
  const pd = normalizePhoneDigits(profile.displayPhone);
  if (pd.includes(q.replace(/\D/g, ''))) return true;
  if (String(profile.totalOrders).includes(q)) return true;
  return false;
}

export function sortCustomers(list, sortId) {
  const out = [...list];
  switch (sortId) {
    case 'spent':
      out.sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0));
      break;
    case 'orders':
      out.sort((a, b) => (b.totalOrders ?? 0) - (a.totalOrders ?? 0));
      break;
    case 'recent':
    default:
      out.sort((a, b) => (b.lastOrderMs ?? 0) - (a.lastOrderMs ?? 0));
      break;
  }
  return out;
}

/**
 * Find aggregate + profile for detail page from route segment.
 */
export function formatOrderDateTimeParts(order) {
  const ms = orderCreatedMs(order);
  if (!ms) return { date: '—', time: '' };
  try {
    const d = new Date(ms);
    return {
      date: d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      time: d
        .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
        .toLowerCase(),
    };
  } catch {
    return { date: '—', time: '' };
  }
}

export function findCustomerByRouteId(profiles, segment) {
  const parsed = parseCustomerRouteId(segment);
  return profiles.find((p) => {
    if (parsed.type === 'uid' && parsed.buyerId) {
      return (
        p.buyerId === parsed.buyerId ||
        p.routeId === `u-${parsed.buyerId}`
      );
    }
    if (parsed.type === 'phone' && parsed.phoneDigits) {
      return p.phoneDigits === parsed.phoneDigits || p.routeId === `p-${parsed.phoneDigits}`;
    }
    return false;
  });
}
