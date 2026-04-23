/**
 * @param {object} props
 * @param {'shop' | 'menu' | 'customer'} props.tab
 * @param {(t: 'shop' | 'menu' | 'customer') => void} props.onChange
 */
export function MainTabs({ tab, onChange }) {
  return (
    <div className="analytics-main-tabs" role="tablist" aria-label="Analytics scope">
      {(
        [
          { id: 'shop', label: 'Shop' },
          { id: 'menu', label: 'Menu' },
          { id: 'customer', label: 'Customer' },
        ]
      ).map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          className={`analytics-main-tab${tab === t.id ? ' analytics-main-tab--active' : ''}`}
          onClick={() => onChange(/** @type {'shop'|'menu'|'customer'} */ (t.id))}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
