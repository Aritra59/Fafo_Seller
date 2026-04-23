/**
 * @param {object} props
 * @param {{ value: string, label: string }[]} props.options
 * @param {string} props.value
 * @param {(v: string) => void} props.onChange
 * @param {string} [props.ariaLabel]
 */
export function SubFilterPills({ options, value, onChange, ariaLabel = 'Sub filter' }) {
  if (!options.length) return null;
  return (
    <div className="analytics-sub-filters" role="group" aria-label={ariaLabel}>
      <div className="analytics-sub-filters-scroll">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`analytics-sub-pill${value === opt.value ? ' analytics-sub-pill--active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
