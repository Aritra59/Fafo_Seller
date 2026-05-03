import { useEffect, useMemo, useState } from 'react';
import { isDemoExplorer } from '../constants/demoMode';
import { subscribeBillingBySellerId, subscribeGlobalAppSettings } from '../services/firestore';
import { getSellerDisplayBalance } from '../services/sellerHelpers';
import {
  computeDailyRunningCostFromBilling,
  hasApprovedRechargeInBilling,
  isBillingUsageOrDeductionRow,
} from '../utils/billingRechargeMetrics';

const ORDER_GMV_ROLLING_MS = 30 * 24 * 60 * 60 * 1000;

function sumApprovedRecharge(rows) {
  let n = 0;
  for (const r of rows) {
    const st = String(r.status ?? '').toLowerCase();
    if (st !== 'approved' && st !== 'completed') continue;
    if (isBillingUsageOrDeductionRow(r)) continue;
    const amt = Number(r.amount);
    if (Number.isFinite(amt) && amt > 0) n += amt;
  }
  return n;
}

function orderRowMillis(order) {
  const c = order?.createdAt;
  if (c && typeof c.toMillis === 'function') return c.toMillis();
  if (c && typeof c.seconds === 'number') return c.seconds * 1000;
  return 0;
}

function orderTotalAmount(order) {
  const v = order?.totalAmount ?? order?.total ?? order?.amount;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function orderStatusNorm(order) {
  return String(order?.status ?? '')
    .toLowerCase()
    .trim();
}

function isOrderConfirmedForDailyCost(order) {
  return orderStatusNorm(order) === 'confirmed';
}

function sumRecentConfirmedOrderGmv(orders, nowMs) {
  const start = nowMs - ORDER_GMV_ROLLING_MS;
  let sum = 0;
  for (const o of orders) {
    if (!isOrderConfirmedForDailyCost(o)) continue;
    const ts = orderRowMillis(o);
    if (ts > 0 && ts < start) continue;
    sum += orderTotalAmount(o);
  }
  return sum;
}

/**
 * Balance and average daily usage aligned with the Billing page.
 * @param {string | null} sellerId
 * @param {Record<string, unknown> | null} seller
 * @param {unknown[]} orders
 */
export function useSellerBillingSummary(sellerId, seller, orders) {
  const demo = isDemoExplorer();
  const [billingRows, setBillingRows] = useState([]);
  const [settings, setSettings] = useState({
    slotRatePerDay: 2,
    orderFeePercent: 2,
  });

  useEffect(() => {
    const unsub = subscribeGlobalAppSettings(
      (s) => setSettings(s),
      () => {},
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!sellerId || demo) {
      setBillingRows([]);
      return undefined;
    }
    return subscribeBillingBySellerId(
      sellerId,
      (rows) => setBillingRows(rows),
      () => setBillingRows([]),
    );
  }, [sellerId, demo]);

  const approvedFromBilling = useMemo(() => sumApprovedRecharge(billingRows), [billingRows]);

  const approvedRecharge = useMemo(() => {
    const fromSeller = Number(seller?.approvedRechargeTotal);
    if (Number.isFinite(fromSeller) && fromSeller > 0) return fromSeller;
    return approvedFromBilling;
  }, [seller?.approvedRechargeTotal, approvedFromBilling]);

  const usageTotal = Number(seller?.usageTotal ?? 0);

  const balance = useMemo(() => {
    if (!seller) return null;
    const displayBal = getSellerDisplayBalance(seller);
    if (displayBal != null) return displayBal;
    if (Number(seller?.balance) === Number(seller?.balance) && seller?.balance != null) {
      return Number(seller.balance);
    }
    const u = Number.isFinite(usageTotal) ? usageTotal : 0;
    return approvedRecharge - u;
  }, [seller, approvedRecharge, usageTotal]);

  const slotRate = settings.slotRatePerDay;
  const feePct = settings.orderFeePercent;
  const totalSlots = Number(seller?.slots ?? 0);
  const dailySlotFee = (Number.isFinite(totalSlots) ? totalSlots : 0) * slotRate;

  const dailyCostSlotsAndOrders = useMemo(() => {
    const now = Date.now();
    const list = Array.isArray(orders) ? orders : [];
    const gmv30 = sumRecentConfirmedOrderGmv(list, now);
    const avgDailyOrderValue = gmv30 / 30;
    const orderFeePart = avgDailyOrderValue * (feePct / 100);
    const v = dailySlotFee + orderFeePart;
    return Math.round(v * 100) / 100;
  }, [orders, dailySlotFee, feePct]);

  const hasPriorRecharge = useMemo(() => {
    if (approvedRecharge > 0) return true;
    if (Number(seller?.approvedRechargeTotal ?? 0) > 0) return true;
    return hasApprovedRechargeInBilling(billingRows);
  }, [approvedRecharge, seller?.approvedRechargeTotal, billingRows]);

  const smartMetrics = useMemo(
    () => computeDailyRunningCostFromBilling(billingRows),
    [billingRows],
  );

  const showSmartRecharge = Boolean(hasPriorRecharge && smartMetrics);

  const effectiveAvgDaily = useMemo(() => {
    if (showSmartRecharge && smartMetrics && smartMetrics.avgDaily > 0) {
      return smartMetrics.avgDaily;
    }
    return dailyCostSlotsAndOrders;
  }, [showSmartRecharge, smartMetrics, dailyCostSlotsAndOrders]);

  const avgDailyFromBilling = Boolean(
    showSmartRecharge && smartMetrics && smartMetrics.avgDaily > 0,
  );

  return { balance, effectiveAvgDaily, avgDailyFromBilling };
}
