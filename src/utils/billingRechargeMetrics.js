/**
 * Derive seller-friendly “daily running cost” from `billing` collection rows.
 * Supports optional per-row types from backend (usage / deduction); falls back to negative amounts.
 */

const IST = 'Asia/Kolkata';

/** @param {Record<string, unknown>} row | null | undefined */
export function billingRowMillis(row) {
  const c = row?.createdAt;
  if (c && typeof c.toMillis === 'function') return c.toMillis();
  if (c && typeof c.seconds === 'number') return c.seconds * 1000;
  const t = row?.timestamp;
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  if (typeof row?.date === 'string') {
    const p = Date.parse(row.date);
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

function istDayKey(ms) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: IST });
}

function lastNDayKeysIST(n, nowMs) {
  const keys = new Set();
  for (let i = 0; i < n; i += 1) {
    keys.add(istDayKey(nowMs - i * 24 * 60 * 60 * 1000));
  }
  return keys;
}

/** @param {Record<string, unknown>} row */
export function isBillingUsageOrDeductionRow(row) {
  const t = String(row?.type ?? row?.kind ?? row?.entryType ?? row?.category ?? '').toLowerCase();
  if (
    t === 'usage' ||
    t === 'deduction' ||
    t === 'debit' ||
    t === 'slot_fee' ||
    t === 'order_fee'
  ) {
    return true;
  }
  const amt = Number(row?.amount);
  return Number.isFinite(amt) && amt < 0;
}

/** Positive rupees deducted for the day. */
/** @param {Record<string, unknown>} row */
function isVoidedBillingRow(row) {
  const st = String(row?.status ?? '').toLowerCase();
  return st === 'void' || st === 'cancelled' || st === 'reversed';
}

export function billingRowDeductionRupees(row) {
  if (isVoidedBillingRow(row)) return 0;
  const amt = Number(row?.amount);
  if (!Number.isFinite(amt)) return 0;
  if (amt < 0) return Math.round(-amt * 100) / 100;
  if (isBillingUsageOrDeductionRow(row) && amt > 0) return Math.round(amt * 100) / 100;
  return 0;
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {{ windowDays: number; nowMs?: number }} opts
 * @returns {{ total: number; activeDays: number; avgDaily: number; windowDays: number } | null}
 */
export function aggregateDeductionsByActiveDays(rows, opts) {
  const windowDays = opts.windowDays === 14 ? 14 : 7;
  const nowMs = opts.nowMs ?? Date.now();
  const allowed = lastNDayKeysIST(windowDays, nowMs);
  const byDay = new Map();

  for (const r of rows) {
    const d = billingRowDeductionRupees(r);
    if (!(d > 0)) continue;
    const ts = billingRowMillis(r);
    if (!ts) continue;
    const key = istDayKey(ts);
    if (!allowed.has(key)) continue;
    byDay.set(key, (byDay.get(key) ?? 0) + d);
  }

  let total = 0;
  let activeDays = 0;
  for (const v of byDay.values()) {
    if (v > 0) {
      total += v;
      activeDays += 1;
    }
  }
  if (activeDays === 0) return null;
  const avgDaily = Math.round((total / activeDays) * 100) / 100;
  return { total, activeDays, avgDaily, windowDays };
}

const MIN_AVG_DAILY_RUPEES = 1;

/**
 * Prefer last 7 days of billing usage; if insufficient, last 14 days.
 * @param {Record<string, unknown>[]} billingRows
 * @param {{ nowMs?: number }} [opts]
 * @returns {{ avgDaily: number; activeDays: number; windowDays: number; total: number } | null}
 */
export function computeDailyRunningCostFromBilling(billingRows, opts = {}) {
  const rows = Array.isArray(billingRows) ? billingRows : [];
  const nowMs = opts.nowMs ?? Date.now();

  const w7 = aggregateDeductionsByActiveDays(rows, { windowDays: 7, nowMs });
  if (w7 && w7.avgDaily >= MIN_AVG_DAILY_RUPEES) {
    return { avgDaily: w7.avgDaily, activeDays: w7.activeDays, windowDays: 7, total: w7.total };
  }

  const w14 = aggregateDeductionsByActiveDays(rows, { windowDays: 14, nowMs });
  if (w14 && w14.avgDaily >= MIN_AVG_DAILY_RUPEES) {
    return { avgDaily: w14.avgDaily, activeDays: w14.activeDays, windowDays: 14, total: w14.total };
  }

  return null;
}

/** @param {Record<string, unknown>[]} rows */
export function hasApprovedRechargeInBilling(rows) {
  for (const r of rows) {
    const st = String(r?.status ?? '').toLowerCase();
    if (st !== 'approved' && st !== 'completed') continue;
    if (isBillingUsageOrDeductionRow(r)) continue;
    const amt = Number(r?.amount);
    if (Number.isFinite(amt) && amt > 0) return true;
  }
  return false;
}
