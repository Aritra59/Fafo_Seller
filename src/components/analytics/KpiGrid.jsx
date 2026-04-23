import { formatInr } from '../../utils/analyticsMath';
import { KpiCard } from './KpiCard';

/**
 * @param {object} props
 * @param {object} props.currentKpi
 * @param {object} props.previousKpi
 * @param {Record<string, number | null | undefined>} props.deltas
 * @param {object} props.spark — { revenue: { c, p }, orders: { c, p } }
 */
export function KpiGrid({ currentKpi, previousKpi, deltas, spark }) {
  const sc = spark?.revenue?.c ?? [];
  const sp = spark?.revenue?.p ?? [];
  const soC = spark?.orders?.c ?? [];
  const soP = spark?.orders?.p ?? [];
  const comboD = deltas.comboAttachPts ?? deltas.comboAttachPct;
  const repD = deltas.repeatRatePts ?? deltas.repeatRate;

  return (
    <div className="analytics-kpi-grid">
      <KpiCard
        title="Revenue"
        tag="Live pace"
        currentDisplay={formatInr(currentKpi.revenue)}
        previousDisplay={formatInr(previousKpi.revenue)}
        pct={deltas.revenue}
        sparkCurrent={sc}
        sparkPrevious={sp}
      />
      <KpiCard
        title="Orders"
        tag="Order flow"
        currentDisplay={String(currentKpi.orderCount)}
        previousDisplay={String(previousKpi.orderCount)}
        pct={deltas.orderCount}
        sparkCurrent={soC}
        sparkPrevious={soP}
      />
      <KpiCard
        title="AOV"
        tag="Basket size"
        currentDisplay={formatInr(currentKpi.aov)}
        previousDisplay={formatInr(previousKpi.aov)}
        pct={deltas.aov}
        sparkCurrent={sc}
        sparkPrevious={sp}
      />
      <KpiCard
        title="Combo attach"
        tag="Bundle pull"
        currentDisplay={`${currentKpi.comboAttachPct.toFixed(1)}%`}
        previousDisplay={`${previousKpi.comboAttachPct.toFixed(1)}%`}
        pct={comboD}
        isPoints
        sparkCurrent={soC}
        sparkPrevious={soP}
      />
      <KpiCard
        title="Repeat rate"
        tag="Loyalty"
        currentDisplay={`${currentKpi.repeatRate.toFixed(1)}%`}
        previousDisplay={`${previousKpi.repeatRate.toFixed(1)}%`}
        pct={repD}
        isPoints
        sparkCurrent={soC}
        sparkPrevious={soP}
      />
      <KpiCard
        title="Unique customers"
        tag="Reach"
        currentDisplay={String(currentKpi.uniqueCustomers)}
        previousDisplay={String(previousKpi.uniqueCustomers)}
        pct={deltas.uniqueCustomers}
        sparkCurrent={soC}
        sparkPrevious={sp}
      />
    </div>
  );
}
