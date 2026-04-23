function rangeToLabel(start, end) {
  if (!start || !end) {
    return '—';
  }
  const a = start.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const b = end.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (a === b) {
    return a;
  }
  return `${a} – ${b}`;
}

/**
 * @param {object} props
 * @param {'day' | 'week' | 'month'} props.period
 * @param {(p: 'day' | 'week' | 'month') => void} props.onChange
 * @param {{ current: string, previous: string } | null | undefined} props.rangeLabel — from `getRangesForPeriod(…).label`
 * @param {{ start: Date, end: Date }} props.currentRange
 * @param {{ start: Date, end: Date }} props.previousRange
 */
export function PeriodTabs({ period, onChange, rangeLabel, currentRange, previousRange }) {
  const curText =
    period === 'day'
      ? (currentRange?.start
          ? currentRange.start.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : '—')
      : (typeof rangeLabel?.current === 'string'
          ? rangeLabel.current
          : rangeToLabel(currentRange?.start, currentRange?.end));
  const prevText =
    period === 'day'
      ? (previousRange?.start
          ? previousRange.start.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : '—')
      : (typeof rangeLabel?.previous === 'string'
          ? rangeLabel.previous
          : rangeToLabel(previousRange?.start, previousRange?.end));
  return (
    <div className="analytics-period">
      <div className="analytics-period-pills" role="group" aria-label="Time period">
        {(
          [
            { id: 'day', label: 'Day' },
            { id: 'week', label: 'Week' },
            { id: 'month', label: 'Month' },
          ]
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            className={`analytics-pill${period === p.id ? ' analytics-pill--active' : ''}`}
            onClick={() => onChange(/** @type {'day'|'week'|'month'} */ (p.id))}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="analytics-period-compare">
        <div className="analytics-compare-card">
          <div className="analytics-compare-label">Current period</div>
          <div className="analytics-compare-date">
            {curText}
          </div>
          <div className="analytics-compare-hint muted" style={{ fontSize: '0.72rem', marginTop: '0.25rem' }}>
            Live tracking enabled
          </div>
        </div>
        <div className="analytics-compare-card">
          <div className="analytics-compare-label">Previous period</div>
          <div className="analytics-compare-date">
            {prevText}
          </div>
          <div className="analytics-compare-hint muted" style={{ fontSize: '0.72rem', marginTop: '0.25rem' }}>
            Reference comparison
          </div>
        </div>
      </div>
    </div>
  );
}
