import { memo } from 'react';
import { formatInr, formatPct } from '../../utils/analyticsMath';
import { Sparkline } from './Sparkline';

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.tag]
 * @param {import('react').ReactNode} props.currentDisplay
 * @param {import('react').ReactNode} props.previousDisplay
 * @param {number | null} props.pct
 * @param {number[]} [props.sparkCurrent]
 * @param {number[]} [props.sparkPrevious]
 * @param {boolean} [props.isPoints]
 */
export const KpiCard = memo(function KpiCard({
  title,
  tag,
  currentDisplay,
  previousDisplay,
  pct,
  sparkCurrent = [],
  sparkPrevious = [],
  isPoints = false,
}) {
  const positive = pct == null || pct >= 0;
  return (
    <article className="analytics-kpi-card">
      <div className="analytics-kpi-card-head">
        <h3 className="analytics-kpi-title">{title}</h3>
        {tag ? <span className="analytics-kpi-tag">{tag}</span> : null}
      </div>
      <div className="analytics-kpi-values">
        <p className="analytics-kpi-prev muted" style={{ margin: 0, fontSize: '0.75rem' }}>
          Previous <strong>{previousDisplay}</strong>
        </p>
        <p className="analytics-kpi-cur" style={{ margin: '0.15rem 0 0' }}>
          Current <strong className="analytics-kpi-cur-val">{currentDisplay}</strong>
        </p>
      </div>
      <div className="analytics-kpi-spark">
        <Sparkline current={sparkCurrent} previous={sparkPrevious} />
      </div>
      {pct != null && Number.isFinite(pct) ? (
        <div
          className={`analytics-kpi-delta${positive ? ' analytics-kpi-delta--up' : ' analytics-kpi-delta--down'}`}
        >
          {formatPct(pct, { points: isPoints })}
        </div>
      ) : (
        <div className="analytics-kpi-delta muted">—</div>
      )}
    </article>
  );
});
