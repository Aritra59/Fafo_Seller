import { useEffect, useMemo, useState } from 'react';
import { useSeller } from '../hooks/useSeller';
import { isDemoExplorer } from '../constants/demoMode';
import {
  buildGrowthCardLines,
  buildInsightLines,
  buildLifetimeOrderCountsByPhone,
  buildOrderCountSparkSeries,
  buildRevenueSparkSeries,
  computeKpiBundle,
  computeMenuAnalytics,
  countBuyersInSegment,
  extractMenuFilterOptions,
  filterOrdersByCustomerSegment,
  filterOrdersInDateRange,
  filterOrdersTouchingMenu,
  getBuyerPhone,
  findPeakHourFromDaySeries,
  findWeakestMenuName,
  getAllValidOrdersForLifetime,
  isStatusCounted,
  kpiDeltas,
  shouldFlagComboPace,
} from '../services/analyticsService';
import {
  subscribeOrdersBySellerId,
  subscribeProductsBySellerId,
  subscribeUsersCollection,
} from '../services/firestore';
import { getRangesForPeriod } from '../utils/analyticsDate';
import { formatInr, pctChange } from '../utils/analyticsMath';
import { AnalyticsHeader } from '../components/analytics/Header';
import { PeriodTabs } from '../components/analytics/PeriodTabs';
import { MainTabs } from '../components/analytics/MainTabs';
import { SubFilterPills } from '../components/analytics/SubFilterPills';
import { KpiGrid } from '../components/analytics/KpiGrid';
import { GrowthSection } from '../components/analytics/GrowthSection';
import { InsightSection } from '../components/analytics/InsightSection';
import './analytics.css';

function countedInRange(orders, range) {
  return filterOrdersInDateRange(orders, range).filter((o) => isStatusCounted(o.status));
}

export function AnalyticsPage() {
  const { seller, sellerId, loading, error } = useSeller();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);

  /** Default to week so older orders in Firestore (not from “today”) still show KPIs. */
  const [period, setPeriod] = useState(
    /** @type {'day' | 'week' | 'month'} */ ('week'),
  );
  const [mainTab, setMainTab] = useState(/** @type {'shop' | 'menu' | 'customer'} */ ('shop'));
  const [menuSub, setMenuSub] = useState('all');
  const [customerSub, setCustomerSub] = useState('all');

  const ranges = useMemo(() => getRangesForPeriod(period), [period]);

  const [userRows, setUserRows] = useState([]);

  useEffect(() => {
    const sid = sellerId && String(sellerId).trim();
    if (!sid) {
      setOrders([]);
      return undefined;
    }
    return subscribeOrdersBySellerId(
      sid,
      (rows) => {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[Analytics] orders snapshot', { sellerId: sid, count: rows.length });
        }
        setOrders(rows);
      },
      (e) => {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.error('[Analytics] orders subscription', e);
        }
        setOrders([]);
      },
    );
  }, [sellerId]);

  useEffect(() => {
    const sid = sellerId && String(sellerId).trim();
    if (!sid) {
      setProducts([]);
      return undefined;
    }
    return subscribeProductsBySellerId(
      sid,
      (rows) => {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[Analytics] products snapshot', { count: rows.length });
        }
        setProducts(rows);
      },
      () => setProducts([]),
    );
  }, [sellerId]);

  useEffect(() => {
    if (!sellerId) {
      setUserRows([]);
      return undefined;
    }
    return subscribeUsersCollection(
      (rows) => setUserRows(Array.isArray(rows) ? rows : []),
      () => setUserRows([]),
    );
  }, [sellerId]);

  const lifetimeMap = useMemo(
    () => buildLifetimeOrderCountsByPhone(getAllValidOrdersForLifetime(orders)),
    [orders],
  );

  const menuOptions = useMemo(() => {
    const keys = extractMenuFilterOptions(products);
    return [{ value: 'all', label: 'All menus' }].concat(
      keys.map((k) => ({ value: k, label: k })),
    );
  }, [products]);

  const buyerNameByPhone = useMemo(() => {
    const m = new Map();
    for (const u of userRows) {
      const p = u?.phone ?? u?.phoneNumber;
      if (typeof p === 'string' && p.trim()) {
        const key = p.replace(/\D/g, '');
        const n = (u.name ?? u.displayName ?? '').trim();
        if (n) {
          m.set(p.trim(), n);
          if (key) m.set(key, n);
        }
      }
    }
    return m;
  }, [userRows]);

  const uniqueBuyerPhonesThisPeriod = useMemo(() => {
    const { current } = ranges;
    const phones = new Set();
    for (const o of filterOrdersInDateRange(orders, current)) {
      if (!isStatusCounted(o.status)) continue;
      const ph = getBuyerPhone(o);
      if (ph) phones.add(ph);
    }
    return Array.from(phones).sort((a, b) => a.localeCompare(b));
  }, [orders, ranges]);

  const customerOptions = useMemo(
    () => [
      { value: 'all', label: 'All customers' },
      { value: 'new', label: 'New' },
      { value: 'regular', label: 'Regular' },
      { value: 'frequent', label: 'Frequent' },
      { value: 'premium', label: 'Premium' },
    ],
    [],
  );

  const {
    currentKpi,
    previousKpi,
    deltas,
    spark,
    menuInsight,
    growthItems,
    customerGrowthItems,
    lines,
  } =
    useMemo(() => {
      const { current, previous } = ranges;
      const baseCurrent = countedInRange(orders, current);
      const basePrevious = countedInRange(orders, previous);
      const allForRepeat = getAllValidOrdersForLifetime(orders);

      const seg = mainTab === 'customer' && customerSub !== 'all' ? customerSub : 'all';
      const menuKey = mainTab === 'menu' && menuSub !== 'all' ? menuSub : 'all';

      let cur = baseCurrent;
      let prev = basePrevious;
      if (mainTab === 'menu' && menuKey !== 'all') {
        cur = filterOrdersTouchingMenu(baseCurrent, products, menuKey);
        prev = filterOrdersTouchingMenu(basePrevious, products, menuKey);
      } else if (mainTab === 'customer' && seg !== 'all') {
        cur = filterOrdersByCustomerSegment(baseCurrent, seg, lifetimeMap);
        prev = filterOrdersByCustomerSegment(basePrevious, seg, lifetimeMap);
      }

      const cKpi = computeKpiBundle(cur, allForRepeat);
      const pKpi = computeKpiBundle(prev, allForRepeat);
      const d = kpiDeltas(cKpi, pKpi);

      const revC = buildRevenueSparkSeries(cur, current, period);
      const revP = buildRevenueSparkSeries(prev, previous, period);
      const ordC = buildOrderCountSparkSeries(cur, current, period);
      const ordP = buildOrderCountSparkSeries(prev, previous, period);
      const sparkObj = { revenue: { c: revC, p: revP }, orders: { c: ordC, p: ordP } };

      const forMenuTable =
        mainTab === 'menu' && menuKey !== 'all' ? cur : baseCurrent;
      const fullMenu = computeMenuAnalytics(
        forMenuTable,
        products,
        mainTab === 'menu' && menuKey !== 'all' ? menuKey : 'all',
      );

      const menuWeak = findWeakestMenuName(fullMenu.byMenu);
      const peak =
        period === 'day' ? findPeakHourFromDaySeries(revC) : null;
      const comboFlag = shouldFlagComboPace(cKpi, pKpi);

      const insight = buildInsightLines(cKpi, pKpi, d, {
        peakHour: peak,
        weakestMenu: mainTab === 'shop' || mainTab === 'menu' ? menuWeak : null,
        comboGap: comboFlag,
      });
      const growth = buildGrowthCardLines(cKpi, pKpi, d);

      const pPremiumNow = countBuyersInSegment(orders, current, 'premium', lifetimeMap);
      const pPremiumPrev = countBuyersInSegment(orders, previous, 'premium', lifetimeMap);
      const pNewNow = countBuyersInSegment(orders, current, 'new', lifetimeMap);
      const pNewPrev = countBuyersInSegment(orders, previous, 'new', lifetimeMap);
      const pFreqNow = countBuyersInSegment(orders, current, 'frequent', lifetimeMap);
      const pFreqPrev = countBuyersInSegment(orders, previous, 'frequent', lifetimeMap);
      const custItems = [];
      const ppD = pctChange(pPremiumNow, pPremiumPrev);
      if (ppD != null) {
        custItems.push({
          text: `Premium buyers ${
            ppD >= 0 ? 'up' : 'down'
          } ${Math.abs(ppD).toFixed(1)}% in count vs last window.`,
          positive: ppD >= 0,
        });
      }
      const nfD = pctChange(pNewNow, pNewPrev);
      if (nfD != null) {
        custItems.push({
          text: `New customer reach ${nfD >= 0 ? 'expanded' : 'tightened'} — ${Math.abs(
            nfD,
          ).toFixed(1)}% vs prior.`,
          positive: nfD >= 0,
        });
      }
      const frD = pctChange(pFreqNow, pFreqPrev);
      if (frD != null) {
        custItems.push({
          text: `Frequent buyers ${
            frD >= 0 ? 'gained' : 'lost'
          } share (${Math.abs(frD).toFixed(1)}%).`,
          positive: frD >= 0,
        });
      }

      return {
        currentKpi: cKpi,
        previousKpi: pKpi,
        deltas: d,
        spark: sparkObj,
        menuInsight: fullMenu,
        growthItems: growth,
        customerGrowthItems: custItems,
        lines: insight,
      };
    }, [orders, ranges, period, mainTab, menuSub, customerSub, products, lifetimeMap]);

  const empty = !loading && orders.length === 0;
  const shopName = seller?.shopName?.trim() || 'Shop';
  const owner = seller?.ownerName?.trim() || shopName;

  if (!sellerId) {
    return (
      <div className="analytics-page">
        <AnalyticsHeader shopName={shopName} ownerName={owner} />
        <div className="analytics-title-row" style={{ marginTop: '0.75rem' }}>
          <h1 className="analytics-h1" style={{ margin: 0 }}>Analytics</h1>
          <span className="analytics-ai-pill">AI Active</span>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          {loading ? 'Loading your shop…' : 'Set up your shop to see analytics.'}
        </p>
      </div>
    );
  }

  return (
    <div className="analytics-page">
      <AnalyticsHeader shopName={shopName} ownerName={owner} />
      <div className="analytics-title-row">
        <h1 className="analytics-h1">Analytics</h1>
        <span className="analytics-ai-pill">AI Active</span>
      </div>
      {loading ? (
        <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
          Loading your shop data…
        </p>
      ) : null}
      {error ? (
        <p className="error" style={{ margin: '0 0 0.5rem' }} role="alert">
          {error.message}
        </p>
      ) : null}
      {isDemoExplorer() ? (
        <p
          className="muted"
          style={{ fontSize: '0.75rem', margin: '0 0 0.5rem' }}
        >
          Demo: metrics reflect the built-in sample orders in demo mode.
        </p>
      ) : null}

      {empty && !error ? (
        <div
          className="analytics-data-empty-hint"
          style={{
            margin: '0 0 0.6rem',
            padding: '0.65rem 0.75rem',
            fontSize: '0.8rem',
            lineHeight: 1.4,
            borderRadius: 12,
            border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
            background: 'color-mix(in srgb, var(--bg-elevated) 92%, transparent)',
          }}
          role="status"
        >
          No orders loaded for this shop yet, or no orders in the selected window. Period filters and
          KPI cards below use live data; numbers stay at zero until orders match the period and
          status rules.
        </div>
      ) : null}

      <PeriodTabs
        period={period}
        onChange={setPeriod}
        rangeLabel={ranges.label}
        currentRange={ranges.current}
        previousRange={ranges.previous}
      />

      <MainTabs tab={mainTab} onChange={setMainTab} />

      {mainTab === 'menu' ? (
        <SubFilterPills options={menuOptions} value={menuSub} onChange={setMenuSub} ariaLabel="Menu focus" />
      ) : null}
      {mainTab === 'customer' ? (
        <SubFilterPills
          options={customerOptions}
          value={customerSub}
          onChange={setCustomerSub}
          ariaLabel="Customer segment"
        />
      ) : null}

      <h2
        className="analytics-section-title"
        style={{ margin: '0.2rem 0 0.6rem' }}
      >
        {mainTab === 'shop' && 'Shop KPIs'}
        {mainTab === 'menu' && 'Menu KPIs'}
        {mainTab === 'customer' && 'Customer KPIs'}
      </h2>
      <KpiGrid
        currentKpi={currentKpi}
        previousKpi={previousKpi}
        deltas={deltas}
        spark={spark}
      />

      {mainTab === 'shop' && (
        <>
          <GrowthSection title="Shop momentum" items={growthItems} />
          <InsightSection title="Data-driven nudges" lines={lines} />
        </>
      )}

      {mainTab === 'menu' && (
        <>
          <section className="analytics-menu-section" aria-label="Menu breakdown" style={{ marginTop: '0.5rem' }}>
            <h2 className="analytics-section-title">Revenue by menu / category</h2>
            <table className="analytics-menu-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>Orders</th>
                </tr>
              </thead>
              <tbody>
                {menuInsight.byMenu.slice(0, 8).map((m) => (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td style={{ textAlign: 'right' }}>{formatInr(m.revenue)}</td>
                    <td style={{ textAlign: 'right' }}>{m.orders}</td>
                  </tr>
                ))}
                {menuInsight.byMenu.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted" style={{ fontSize: '0.8rem' }}>
                      No line-item data in this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <h2 className="analytics-section-title" style={{ marginTop: '0.6rem' }}>
              Top & weak items
            </h2>
            <p className="muted" style={{ fontSize: '0.75rem', margin: 0 }}>By share of line revenue</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.4rem' }}>
              <div>
                <h3 className="analytics-kpi-title" style={{ fontSize: '0.7rem' }}>Top</h3>
                <ol style={{ margin: 0, padding: '0 0 0 1rem', fontSize: '0.78rem' }}>
                  {menuInsight.topItems.slice(0, 4).map((r) => (
                    <li key={r.name}>{r.name} · {formatInr(r.revenue)}</li>
                  ))}
                </ol>
              </div>
              <div>
                <h3 className="analytics-kpi-title" style={{ fontSize: '0.7rem' }}>Weak</h3>
                <ol style={{ margin: 0, padding: '0 0 0 1rem', fontSize: '0.78rem' }}>
                  {menuInsight.weakItems.map((r) => (
                    <li key={r.name}>{r.name} · {formatInr(r.revenue)}</li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
          <InsightSection title="Menu nudges" lines={lines} />
        </>
      )}

      {mainTab === 'customer' && (
        <>
          <section aria-label="Customer mix" style={{ marginTop: '0.2rem' }}>
            <h2 className="analytics-section-title" style={{ margin: '0.2rem 0' }}>
              Segment headcount (this period)
            </h2>
            {(['new', 'regular', 'frequent', 'premium']).map((seg) => {
              const n = countBuyersInSegment(orders, ranges.current, seg, lifetimeMap);
              return (
                <div key={seg} className="analytics-cust-metric">
                  <span style={{ textTransform: 'capitalize' }}>{seg}</span>
                  <span>{n}</span>
                </div>
              );
            })}
            {uniqueBuyerPhonesThisPeriod.length ? (
              <div style={{ marginTop: '0.75rem' }}>
                <h2 className="analytics-section-title" style={{ fontSize: '0.7rem' }}>
                  Buyers (current period)
                </h2>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '0.78rem' }}>
                  {uniqueBuyerPhonesThisPeriod.map((ph) => {
                    const d = ph.replace(/\D/g, '');
                    const nm =
                      buyerNameByPhone.get(ph) || buyerNameByPhone.get(d) || '';
                    return (
                      <li
                        key={ph}
                        className="analytics-cust-metric"
                        style={{ border: 'none', padding: '0.25rem 0' }}
                      >
                        <span
                          className="muted"
                          style={{ fontSize: '0.7rem' }}
                        >
                          {ph}
                        </span>
                        {nm ? <span> · {nm}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>
          <GrowthSection title="Customer momentum" items={customerGrowthItems} />
          <InsightSection title="Relationship signals" lines={lines} />
        </>
      )}

    </div>
  );
}
