export function safeDiv(n, d) {
  if (!d || d === 0) return 0;
  return n / d;
}

/**
 * @returns { number | null } null if not meaningful
 */
export function pctChange(current, previous) {
  if (previous == null || !Number.isFinite(Number(previous)) || previous === 0) {
    if (current == null || !Number.isFinite(Number(current)) || current === 0) return null;
    return 100;
  }
  return ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100;
}

export function formatPct(n, { points = false } = {}) {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const s = n >= 0 ? '+' : '−';
  if (points) {
    return `${s}${abs.toFixed(1)} pts`;
  }
  return `${s}${abs.toFixed(1)}%`;
}

export function formatInr(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/**
 * @param {number[]} series
 * @param {number} width
 * @param {number} height
 */
export function buildSparklinePath(series, width, height) {
  if (!Array.isArray(series) || series.length === 0) return '';
  const min = Math.min(...series, 0);
  const max = Math.max(...series, 0.0001);
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  return series
    .map((v, i) => {
      const x = pad + (i / Math.max(1, series.length - 1)) * w;
      const t = (v - min) / (max - min);
      const y = pad + h * (1 - t);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}
