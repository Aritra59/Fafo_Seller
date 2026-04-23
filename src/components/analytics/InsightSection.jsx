/**
 * @param {object} props
 * @param {string[]} props.lines
 * @param {string} [props.title]
 */
export function InsightSection({ title = 'AI-style insights (from your data)', lines = [] }) {
  if (!lines.length) return null;
  return (
    <section className="analytics-insights" aria-label={title}>
      <h2 className="analytics-section-title">{title}</h2>
      <ul className="analytics-insight-list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {lines.map((line, i) => (
          <li key={i} className="analytics-insight-line">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
