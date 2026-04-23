import { isInRange } from '../utils/analyticsDate';
import { getOrderTimeMsForAnalytics } from '../utils/analyticsTime';
import { pctChange, safeDiv } from '../utils/analyticsMath';

/**
 * ---------------------------------------------------------------------------
 * ANALYTICS ARCHITECTURE (seller Insights / Analytics)
 * ---------------------------------------------------------------------------
 * **Current analytics is rule-based deterministic logic, not an AI model.**
 * There is no LLM/ML inference: metrics and copy are computed from Firestore
 * snapshots in this module plus composition in `AnalyticsPage.jsx`.
 *
 * **Firebase collections used**
 * - `orders` (by `sellerId`) — time windows, revenue sums, order counts, buyer
 *   phones, repeat/segment logic, sparkline buckets.
 * - `products` — menu/category filters and menu revenue attribution from line items.
 * - `users` — enrich buyer labels from stored phone/name when present.
 *
 * **AOV** — `computeKpiBundle`: `safeDiv(totalRevenue, orderCount)` using numeric
 * `order.total` for orders whose status is in `VALID_COUNT_STATUSES`.
 *
 * **Repeat rate** — `repeatRatePercent`: among distinct buyer phones appearing in
 * the period with valid orders, share where `buildLifetimeOrderCountsByPhone` count > 1.
 *
 * **Momentum / nudges** — `buildInsightLines`, `buildGrowthCardLines`: fixed thresholds
 * on KPI deltas (e.g. AOV % change, repeat rate) produce suggestion strings — templated
 * heuristics only.
 * ---------------------------------------------------------------------------
 */

/**
 * Order statuses that count toward revenue & volume (excludes cancelled / rejected / refunded).
 * Includes "new" so newly placed (not yet kitchen) orders still show in period totals.
 */
export const VALID_COUNT_STATUSES = new Set([
  'new',
  'confirmed',
  'preparing',
  'ready',
  'completed',
  'delivered',
  'paid',
]);

function normalizeStatus(status) {
  return String(status ?? '')
    .trim()
    .toLowerCase();
}

export function getOrderTimeMs(order) {
  return getOrderTimeMsForAnalytics(order, { allowUpdatedFallback: true });
}

export function getBuyerPhone(order) {
  const p =
    order?.buyerPhone ??
    order?.phone ??
    order?.customerPhone ??
    order?.buyer?.phone ??
    '';
  if (typeof p === 'string' && p.trim()) return p.trim();
  return null;
}

export function isStatusCounted(status) {
  return VALID_COUNT_STATUSES.has(normalizeStatus(status));
}

/**
 * @param {object[]} orders
 * @param {{ start: Date, end: Date }} range
 */
export function filterOrdersInDateRange(orders, range) {
  return (orders ?? []).filter((o) => {
    const t = getOrderTimeMs(o);
    if (t == null) return false;
    return isInRange(new Date(t), range);
  });
}

function filterCountedInRange(orders, range) {
  return filterOrdersInDateRange(orders, range).filter((o) => isStatusCounted(o.status));
}

/**
 * @param {object} order
 */
export function orderHasComboOrMultiItem(order) {
  const items = order?.items;
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.length > 1;
}

/**
 * Orders with >1 line OR combo-like first line.
 */
function comboAttachNumerator(orders) {
  let n = 0;
  for (const o of orders) {
    if (orderHasComboOrMultiItem(o)) n += 1;
  }
  return n;
}

function sumTotal(orders) {
  let s = 0;
  for (const o of orders) {
    const t = Number(o?.total);
    if (Number.isFinite(t)) s += t;
  }
  return s;
}

/**
 * Lifetime order count per buyer phone (all orders in dataset).
 * @param {object[]} allOrders
 */
export function buildLifetimeOrderCountsByPhone(allOrders) {
  const map = new Map();
  for (const o of allOrders ?? []) {
    if (!isStatusCounted(o.status)) continue;
    const ph = getBuyerPhone(o);
    if (!ph) continue;
    map.set(ph, (map.get(ph) ?? 0) + 1);
  }
  return map;
}

/**
 * @param {number} lifetimeCount
 * @returns {'new' | 'regular' | 'frequent' | 'premium'}
 */
export function segmentFromLifetimeCount(lifetimeCount) {
  const n = Number(lifetimeCount) || 0;
  if (n <= 1) return 'new';
  if (n >= 2 && n <= 4) return 'regular';
  if (n >= 5 && n <= 9) return 'frequent';
  return 'premium';
}

/**
 * Repeat rate: among distinct buyers in period with valid orders, % with lifetime count > 1.
 */
function repeatRatePercent(countedInPeriod, lifetimeMap) {
  const seen = new Set();
  const buyers = [];
  for (const o of countedInPeriod) {
    const ph = getBuyerPhone(o);
    if (!ph || seen.has(ph)) continue;
    seen.add(ph);
    buyers.push(ph);
  }
  if (buyers.length === 0) return 0;
  let repeat = 0;
  for (const ph of buyers) {
    const n = lifetimeMap.get(ph) ?? 0;
    if (n > 1) repeat += 1;
  }
  return (repeat / buyers.length) * 100;
}

/**
 * @param {object[]} countedOrdersInRange
 * @param {'new'|'regular'|'frequent'|'premium'|'all'} segment
 * @param {Map<string, number>} lifetimeMap
 */
export function filterOrdersByCustomerSegment(countedOrdersInRange, segment, lifetimeMap) {
  if (segment === 'all') return countedOrdersInRange;
  return countedOrdersInRange.filter((o) => {
    const ph = getBuyerPhone(o);
    if (!ph) return false;
    const seg = segmentFromLifetimeCount(lifetimeMap.get(ph) ?? 0);
    return seg === segment;
  });
}

/**
 * @param {object[]} countedInRange
 */
export function computeKpiBundle(countedInRange, allCountedOrders) {
  const revenue = sumTotal(countedInRange);
  const orderCount = countedInRange.length;
  const aov = safeDiv(revenue, orderCount);
  const comboN = comboAttachNumerator(countedInRange);
  const comboAttachPct = orderCount > 0 ? (comboN / orderCount) * 100 : 0;
  const lifetimeMap = buildLifetimeOrderCountsByPhone(allCountedOrders);
  const phones = new Set();
  for (const o of countedInRange) {
    const ph = getBuyerPhone(o);
    if (ph) phones.add(ph);
  }
  const uniqueCustomers = phones.size;
  const repeatRate = repeatRatePercent(countedInRange, lifetimeMap);
  return {
    revenue,
    orderCount,
    aov,
    comboAttachPct,
    uniqueCustomers,
    repeatRate,
  };
}

/**
 * @param {object[]} allOrders
 */
export function getAllValidOrdersForLifetime(allOrders) {
  return (allOrders ?? []).filter((o) => isStatusCounted(o.status) && getOrderTimeMs(o) != null);
}

/**
 * @param {object} currentKpi
 * @param {object} previousKpi
 */
export function kpiDeltas(currentKpi, previousKpi) {
  return {
    revenue: pctChange(currentKpi.revenue, previousKpi.revenue),
    orderCount: pctChange(currentKpi.orderCount, previousKpi.orderCount),
    aov: pctChange(currentKpi.aov, previousKpi.aov),
    /** Relative % change of the rate */
    comboAttachPct: pctChange(currentKpi.comboAttachPct, previousKpi.comboAttachPct),
    uniqueCustomers: pctChange(currentKpi.uniqueCustomers, previousKpi.uniqueCustomers),
    repeatRate: pctChange(currentKpi.repeatRate, previousKpi.repeatRate),
    /** Percentage point change (current − previous) for rate metrics */
    comboAttachPts: currentKpi.comboAttachPct - previousKpi.comboAttachPct,
    repeatRatePts: currentKpi.repeatRate - previousKpi.repeatRate,
  };
}

/**
 * Sparkline buckets: revenue per bucket for valid orders in range.
 * @param {'day'|'week'|'month'} period
 */
export function buildRevenueSparkSeries(ordersInRange, range, period) {
  const counted = (ordersInRange ?? []).filter((o) => isStatusCounted(o.status));
  if (period === 'day') {
    const cur = Array(24).fill(0);
    for (const o of counted) {
      const t = getOrderTimeMs(o);
      if (t == null) continue;
      const h = new Date(t).getHours();
      const tot = Number(o?.total);
      if (Number.isFinite(tot)) cur[h] += tot;
    }
    return cur;
  }
  if (period === 'week') {
    const cur = Array(7).fill(0);
    const start = range.start.getTime();
    const dayMs = 86400000;
    for (const o of counted) {
      const t = getOrderTimeMs(o);
      if (t == null) continue;
      const dayIdx = Math.floor((t - start) / dayMs);
      if (dayIdx >= 0 && dayIdx < 7) {
        const tot = Number(o?.total);
        if (Number.isFinite(tot)) cur[dayIdx] += tot;
      }
    }
    return cur;
  }
  // month: days from 1st to end of range
  const d0 = new Date(range.start);
  const d1 = new Date(range.end);
  const days = Math.max(1, Math.ceil((d1 - d0) / 86400000) + 1);
  const cur = Array(Math.min(31, days)).fill(0);
  for (const o of counted) {
    const t = getOrderTimeMs(o);
    if (t == null) continue;
    const day = new Date(t).getDate() - 1;
    if (day >= 0 && day < cur.length) {
      const tot = Number(o?.total);
      if (Number.isFinite(tot)) cur[day] += tot;
    }
  }
  return cur;
}

/** Same bucketing as revenue; counts valid orders per bucket. */
export function buildOrderCountSparkSeries(ordersInRange, range, period) {
  const counted = (ordersInRange ?? []).filter((o) => isStatusCounted(o.status));
  if (period === 'day') {
    const cur = Array(24).fill(0);
    for (const o of counted) {
      const t = getOrderTimeMs(o);
      if (t == null) continue;
      const h = new Date(t).getHours();
      cur[h] += 1;
    }
    return cur;
  }
  if (period === 'week') {
    const cur = Array(7).fill(0);
    const start = range.start.getTime();
    const dayMs = 86400000;
    for (const o of counted) {
      const t = getOrderTimeMs(o);
      if (t == null) continue;
      const dayIdx = Math.floor((t - start) / dayMs);
      if (dayIdx >= 0 && dayIdx < 7) cur[dayIdx] += 1;
    }
    return cur;
  }
  const d0 = new Date(range.start);
  const d1 = new Date(range.end);
  const days = Math.max(1, Math.ceil((d1 - d0) / 86400000) + 1);
  const cur = Array(Math.min(31, days)).fill(0);
  for (const o of counted) {
    const t = getOrderTimeMs(o);
    if (t == null) continue;
    const day = new Date(t).getDate() - 1;
    if (day >= 0 && day < cur.length) cur[day] += 1;
  }
  return cur;
}

/**
 * Menu bucket key for a product
 */
function productMenuKey(p) {
  const cat = String(p?.category ?? '').trim();
  if (cat) return cat;
  const c = String(p?.cuisineCategory ?? '').trim();
  if (c) return c;
  return 'Menu';
}

/**
 * @param {object[]} products
 * @returns {string[]}
 */
export function extractMenuFilterOptions(products) {
  const s = new Set();
  for (const p of products ?? []) {
    s.add(productMenuKey(p));
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * @param {object} line
 * @param {Map<string, string>} nameToMenu
 */
function lineItemMenuKey(line, nameToMenu) {
  const pid = String(line?.productId ?? line?.id ?? '').trim();
  if (pid && nameToMenu.has(`__id_${pid}`)) {
    return nameToMenu.get(`__id_${pid}`);
  }
  const name = String(line?.name ?? line?.title ?? '').trim().toLowerCase();
  return nameToMenu.get(name) ?? 'Menu';
}

/**
 * Enrich map with id keys when products have id
 */
function buildLineMenuResolver(products) {
  const nameToMenu = new Map();
  for (const p of products ?? []) {
    const key = productMenuKey(p);
    const n = String(p?.name ?? p?.title ?? '').trim().toLowerCase();
    if (n) nameToMenu.set(n, key);
    if (p.id) nameToMenu.set(`__id_${p.id}`, key);
  }
  return nameToMenu;
}

/**
 * @param {object[]} countedOrders
 * @param {object[]} products
 * @param {string | null} menuKeyFilter — null = all
 */
/**
 * Orders in list that have ≥1 line item in this menu (for KPI scoping).
 */
export function filterOrdersTouchingMenu(countedOrders, products, menuKey) {
  if (!menuKey || menuKey === 'all') return countedOrders;
  const resolver = buildLineMenuResolver(products);
  return countedOrders.filter((o) => {
    const items = o?.items;
    if (!Array.isArray(items)) return false;
    for (const line of items) {
      if (lineItemMenuKey(line, resolver) === menuKey) return true;
    }
    return false;
  });
}

export function computeMenuAnalytics(countedOrders, products, menuKeyFilter) {
  const resolver = buildLineMenuResolver(products);
  const itemRevenue = new Map();
  const itemQty = new Map();
  const menuRevenue = new Map();
  const menuOrders = new Map();

  for (const o of countedOrders) {
    const items = o?.items;
    if (!Array.isArray(items)) continue;
    const lineEntries = [];
    for (const line of items) {
      const mk = lineItemMenuKey(line, resolver);
      if (menuKeyFilter && menuKeyFilter !== 'all' && mk !== menuKeyFilter) continue;
      lineEntries.push({ line, mk });
    }
    if (lineEntries.length === 0) continue;
    const orderMenus = new Set();
    for (const { line, mk } of lineEntries) {
      const name = String(line?.name ?? line?.title ?? 'Item').trim() || 'Item';
      const price = Number(line?.price ?? 0);
      const qty = Number(line?.qty ?? line?.quantity ?? 1) || 1;
      const lineRev = Number.isFinite(price) ? price * qty : 0;
      itemRevenue.set(name, (itemRevenue.get(name) ?? 0) + lineRev);
      itemQty.set(name, (itemQty.get(name) ?? 0) + qty);
      menuRevenue.set(mk, (menuRevenue.get(mk) ?? 0) + lineRev);
      orderMenus.add(mk);
    }
    for (const mk of orderMenus) {
      menuOrders.set(mk, (menuOrders.get(mk) ?? 0) + 1);
    }
  }

  const topItems = [...itemRevenue.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, rev]) => ({ name, revenue: rev, qty: itemQty.get(name) ?? 0 }));
  const weakItems = [...itemRevenue.entries()]
    .filter(([, rev]) => rev > 0)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 5)
    .map(([name, rev]) => ({ name, revenue: rev, qty: itemQty.get(name) ?? 0 }));

  const byMenu = [...menuRevenue.entries()]
    .map(([name, revenue]) => ({
      name,
      revenue,
      orders: menuOrders.get(name) ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return { topItems, weakItems, byMenu, menuOrders };
}

/**
 * Rule-based copy from current vs previous KPIs and series.
 * @param {object} c current Kpi bundle
 * @param {object} p previous Kpi bundle
 * @param {object} deltas from kpiDeltas
 * @param {object} options
 */
export function buildInsightLines(c, p, deltas, { peakHour, weakestMenu, comboGap }) {
  const lines = [];
  if (c.orderCount === 0 && p.orderCount === 0) {
    return [
      'No completed orders in these periods yet. As orders flow in, insights will appear here.',
    ];
  }
  if (deltas.aov != null && deltas.aov < -3) {
    lines.push('Basket size (AOV) is down. Consider combo offers and upsell on slow hours.');
  }
  if (deltas.repeatRate != null && deltas.repeatRate < -5) {
    lines.push('Repeat buyers dipped — re-engage frequent customers with a quick WhatsApp nudge.');
  }
  if (deltas.revenue != null && deltas.revenue > 5) {
    lines.push(`Revenue pace is ${(100 + deltas.revenue).toFixed(0)}% of the prior window — great momentum.`);
  }
  if (peakHour != null && peakHour >= 0) {
    lines.push(`Peak order activity around ${formatHour12(peakHour)}. Prep inventory a little earlier.`);
  }
  if (weakestMenu) {
    lines.push(`“${weakestMenu}” is the softest menu strip — refresh pricing or items there.`);
  }
  if (comboGap) {
    lines.push('Combo attach is trailing order growth — try bundle promos on best sellers.');
  }
  if (deltas.orderCount != null && deltas.orderCount < -8) {
    lines.push('Order count dropped versus last period — check slots, hours, and go-live status.');
  }
  if (lines.length === 0) {
    lines.push('Steady performance. Keep an eye on repeat rate and AOV for margin health.');
  }
  return lines.slice(0, 5);
}

function formatHour12(h) {
  if (h < 0 || h > 23) return '—';
  const am = h < 12;
  const x = h % 12 || 12;
  return `${x} ${am ? 'AM' : 'PM'}`;
}

/**
 * Hour of max revenue in day (0–23) from 24h series
 */
export function findPeakHourFromDaySeries(series24) {
  if (!Array.isArray(series24) || series24.length < 24) return null;
  let max = -1;
  let idx = 0;
  for (let i = 0; i < 24; i += 1) {
    if (series24[i] > max) {
      max = series24[i];
      idx = i;
    }
  }
  return max > 0 ? idx : null;
}

/**
 * @param {ReturnType<typeof computeMenuAnalytics>['byMenu']} byMenu
 */
export function findWeakestMenuName(byMenu) {
  if (!byMenu || byMenu.length < 2) return null;
  const sorted = [...byMenu].filter((m) => m.revenue > 0).sort((a, b) => a.revenue - b.revenue);
  return sorted[0]?.name ?? null;
}

/**
 * @param {object} growth - partial
 */
export function buildGrowthCardLines(cKpi, pKpi, d) {
  const o = [];
  if (d.revenue != null) {
    o.push({
      text: `Revenue ${
        d.revenue >= 0 ? 'up' : 'down'
      } ${Math.abs(d.revenue).toFixed(1)}% compared to the previous period.`,
      positive: d.revenue >= 0,
    });
  }
  if (d.orderCount != null) {
    o.push({
      text: `Order flow ${d.orderCount >= 0 ? '+' : '−'}${Math.abs(d.orderCount).toFixed(1)}% vs last window.`,
      positive: d.orderCount >= 0,
    });
  }
  return o.filter(Boolean);
}

/**
 * Distinct buyers in range whose lifetime segment matches (or "all").
 */
export function countBuyersInSegment(orders, range, segment, lifetimeMap) {
  const o = filterCountedInRange(orders, range);
  const filtered = filterOrdersByCustomerSegment(o, segment, lifetimeMap);
  const s = new Set();
  for (const x of filtered) {
    const ph = getBuyerPhone(x);
    if (ph) s.add(ph);
  }
  return s.size;
}

export function shouldFlagComboPace(cKpi, pKpi) {
  if (cKpi.orderCount < 2 || pKpi.orderCount < 1) return false;
  const orderUp = cKpi.orderCount > pKpi.orderCount * 1.02;
  const comboDown = cKpi.comboAttachPct < pKpi.comboAttachPct - 1;
  return orderUp && comboDown;
}
