/**
 * @param {object} props
 * @param {{ text: string, positive: boolean }[]} props.items
 * @param {string} [props.title]
 */
export function GrowthSection({ title = 'Growth & momentum', items = [] }) {
  if (!items.length) return null;
  return (
    <section className="analytics-growth" aria-label={title}>
      <h2 className="analytics-section-title">{title}</h2>
      <ul className="analytics-growth-list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {items.map((it, i) => (
          <li
            key={i}
            className={`analytics-growth-item${it.positive ? ' analytics-growth-item--up' : ' analytics-growth-item--down'}`}
          >
            {it.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
