/**
 * Trial window for a seller document from Firestore.
 * @param {import('firebase/firestore').Timestamp | Date | string | null | undefined} trialEnd
 * @returns {Date | null}
 */
function trialEndToDate(trialEnd) {
  if (trialEnd == null) return null;
  if (typeof trialEnd?.toDate === 'function') {
    return trialEnd.toDate();
  }
  if (trialEnd instanceof Date) {
    return trialEnd;
  }
  const d = new Date(trialEnd);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Days remaining at or below this count show the "trial ending" warning UI. */
export const TRIAL_ENDING_DAYS_THRESHOLD = 3;

/**
 * Full calendar days left until trial ends (0 if expired or unknown).
 * @param {import('firebase/firestore').Timestamp | Date | string | null | undefined} trialEnd
 * @returns {number}
 */
export function getTrialDaysLeft(trialEnd) {
  const end = trialEndToDate(trialEnd);
  if (!end) return 0;
  const now = Date.now();
  if (end.getTime() <= now) return 0;
  return Math.ceil((end.getTime() - now) / (24 * 60 * 60 * 1000));
}

/**
 * Whether the 15-day (or configured) trial is still valid.
 * @param {object | null | undefined} seller - Firestore seller doc data (+ optional id)
 * @returns {'active' | 'expired'}
 */
export function checkTrialStatus(seller) {
  if (!seller) {
    return 'expired';
  }
  const end = trialEndToDate(seller.trialEnd);
  if (!end) {
    return 'expired';
  }
  return end.getTime() > Date.now() ? 'active' : 'expired';
}

/**
 * True when trial is active but within {@link TRIAL_ENDING_DAYS_THRESHOLD} days of ending.
 */
export function isTrialEndingSoon(seller) {
  if (!seller || checkTrialStatus(seller) !== 'active') {
    return false;
  }
  const days = getTrialDaysLeft(seller.trialEnd);
  return days > 0 && days <= TRIAL_ENDING_DAYS_THRESHOLD;
}

function normalizeSellerModeToken(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/-/g, '');
}

/**
 * Canonical lifecycle for UI and buyer rules.
 * **Priority:** suspended → blocked → live → freeTrial → demo.
 * `sellerMode === 'live'` or `isLive === true` wins over active trial dates.
 *
 * @param {object | null | undefined} seller
 * @returns {'suspended' | 'blocked' | 'live' | 'freeTrial' | 'demo'}
 */
export function resolveEffectiveSellerMode(seller) {
  if (!seller) return 'demo';
  const sm = normalizeSellerModeToken(seller.sellerMode);
  const bill = normalizeSellerModeToken(seller.sellerBillingState);
  if (sm === 'suspended' || bill === 'suspended') return 'suspended';
  if (seller.isBlocked === true) return 'blocked';
  if (sm === 'live' || seller.isLive === true) return 'live';
  const approvedTotal = Number(seller.approvedRechargeTotal);
  if (Number.isFinite(approvedTotal) && approvedTotal > 0) return 'live';
  if (seller.hasLiveHistory === true) return 'live';
  if (sm === 'freetrial' || sm === 'trial') return 'freeTrial';
  if (checkTrialStatus(seller) === 'active') return 'freeTrial';
  if (sm === 'demo') return 'demo';
  return 'demo';
}

/**
 * Buyer listing / shop visible when live or free trial, and not blocked/suspended.
 */
export function isSellerVisibleToBuyers(seller) {
  const mode = resolveEffectiveSellerMode(seller);
  return mode === 'live' || mode === 'freeTrial';
}

/**
 * New buyer orders: live only with slots &gt; 0, OR free trial (any slots).
 */
export function canSellerAcceptNewOrders(seller) {
  if (!seller) return false;
  if (seller.sellingAccessDisabled === true) return false;
  if (seller.fafoSubscriptionActive === false) return false;
  const mode = resolveEffectiveSellerMode(seller);
  if (mode === 'blocked' || mode === 'suspended') return false;
  if (mode === 'freeTrial') return true;
  if (mode === 'live') {
    const slots = Number(seller.slots ?? 0);
    return Number.isFinite(slots) && slots > 0;
  }
  return false;
}

/**
 * Whether buyers can place real orders (alias of {@link canSellerAcceptNewOrders}).
 */
export function canBuyersPlaceOrders(seller) {
  return canSellerAcceptNewOrders(seller);
}

/**
 * Balance shown in dashboard / billing (`currentAvailableBalance` preferred).
 */
export function getSellerDisplayBalance(seller) {
  const raw = seller?.currentAvailableBalance ?? seller?.balance;
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Header / compact status label from {@link resolveEffectiveSellerMode}.
 */
export function getSellerStatusBadge(seller) {
  const mode = resolveEffectiveSellerMode(seller);
  const base = 'app-header-status-badge';
  switch (mode) {
    case 'live':
      return { mode, label: 'LIVE', className: `${base} ${base}--live` };
    case 'freeTrial':
      return { mode, label: 'FREE TRIAL', className: `${base} ${base}--trial` };
    case 'suspended':
      return { mode, label: 'SUSPENDED', className: `${base} ${base}--suspended` };
    case 'blocked':
      return { mode, label: 'BLOCKED', className: `${base} ${base}--blocked` };
    default:
      return { mode, label: 'DEMO', className: `${base} ${base}--demo` };
  }
}

function parseTimeToMinutes(str) {
  const s = String(str ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

function openingClosingMinutes(seller) {
  const openStr =
    seller?.openingTime ?? seller?.openTime ?? seller?.open_time ?? '';
  const closeStr =
    seller?.closingTime ?? seller?.closeTime ?? seller?.close_time ?? '';
  return {
    open: parseTimeToMinutes(openStr),
    close: parseTimeToMinutes(closeStr),
  };
}

/**
 * Shop open now from opening/closing times (local same-day, "HH:mm").
 * Supports `openTime` / `closeTime` aliases from the product spec.
 * @returns {boolean | null} null if times missing/invalid
 */
export function computeShopOpenNow(seller) {
  const { open, close } = openingClosingMinutes(seller);
  if (open == null || close == null) {
    return null;
  }
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  if (close >= open) {
    return cur >= open && cur <= close;
  }
  return cur >= open || cur <= close;
}

/** Stored on `sellers` from Settings — manual override for buyer `shopOpenNow`. */
export const SHOP_OPEN_MANUAL_MODES = /** @type {const} */ (['auto', 'open', 'closed']);

/**
 * Normalize manual mode from Firestore (unknown → `auto`).
 * @param {unknown} raw
 * @returns {'auto' | 'open' | 'closed'}
 */
export function normalizeShopOpenManualMode(raw) {
  const m = String(raw ?? 'auto')
    .trim()
    .toLowerCase();
  if (m === 'open' || m === 'force_open' || m === 'always_open') return 'open';
  if (m === 'closed' || m === 'force_closed' || m === 'always_closed') return 'closed';
  return 'auto';
}

/**
 * Effective open/closed: manual **open** / **closed** wins; otherwise same as {@link computeShopOpenNow}.
 * @returns {boolean | null} `true`/`false` when manual or when hours yield a value; `null` only in **auto** with invalid/missing hours
 */
export function resolveShopOpenNow(seller) {
  const mode = normalizeShopOpenManualMode(
    seller?.shopOpenManualMode ?? seller?.shopOpenMode,
  );
  if (mode === 'open') return true;
  if (mode === 'closed') return false;
  return computeShopOpenNow(seller);
}

/**
 * Buyer / UI: respects manual override, then hours.
 * @returns {boolean | null}
 */
export function isShopOpenNow(seller) {
  return resolveShopOpenNow(seller);
}

/**
 * Short label for stats cards (uses effective mode priority).
 */
export function getSellerModeLabel(seller) {
  const m = resolveEffectiveSellerMode(seller);
  if (m === 'live') return 'Live';
  if (m === 'freeTrial') return 'Free trial';
  if (m === 'suspended') return 'Suspended';
  if (m === 'blocked') return 'Blocked';
  return 'Demo';
}

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function orderTimestampMs(order) {
  const ts = order?.createdAt ?? order?.updatedAt;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  const d = ts ? new Date(ts) : null;
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
}

function completedStatuses() {
  return new Set(['completed', 'delivered']);
}

/**
 * Revenue from orders (uses `total`, `totalAmount`, or `amount`).
 */
export function computeOrderRevenue(order) {
  if (!completedStatuses().has(String(order?.status ?? '').toLowerCase())) {
    return 0;
  }
  const v = order?.total ?? order?.totalAmount ?? order?.amount;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function computeRevenueTotals(orders) {
  const start = startOfTodayMs();
  let today = 0;
  let total = 0;
  for (const o of orders) {
    const amt = computeOrderRevenue(o);
    if (amt <= 0) continue;
    total += amt;
    if (orderTimestampMs(o) >= start) {
      today += amt;
    }
  }
  return { today, total };
}

/**
 * Orders awaiting prep (new → confirmed → preparing).
 */
export function countSellerPendingOrders(orders) {
  let n = 0;
  for (const o of orders) {
    const s = String(o?.status ?? '').trim().toLowerCase();
    if (s === 'new' || s === 'confirmed' || s === 'preparing') n += 1;
  }
  return n;
}

export function countReadyOrders(orders) {
  let n = 0;
  for (const o of orders) {
    if (String(o?.status ?? '').trim().toLowerCase() === 'ready') n += 1;
  }
  return n;
}

export function countCompletedOrders(orders) {
  let n = 0;
  for (const o of orders) {
    const s = String(o?.status ?? '').trim().toLowerCase();
    if (s === 'completed' || s === 'delivered') n += 1;
  }
  return n;
}

export function billingBalanceWarning(balance) {
  const b = Number(balance);
  if (!Number.isFinite(b)) return 'healthy';
  if (b <= 0) return 'exhausted';
  if (b < 50) return 'urgent';
  if (b < 200) return 'low';
  return 'healthy';
}
