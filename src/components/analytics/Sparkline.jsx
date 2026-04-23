import { buildSparklinePath } from '../../utils/analyticsMath';

const W = 200;
const H = 40;

/**
 * @param {object} props
 * @param {number[]} props.current
 * @param {number[]} props.previous
 */
function align(s1, s2) {
  const a = Array.isArray(s1) && s1.length ? [...s1] : [0];
  const b = Array.isArray(s2) && s2.length ? [...s2] : [0];
  const n = Math.max(a.length, b.length, 1);
  while (a.length < n) a.push(0);
  while (b.length < n) b.push(0);
  return [a.slice(0, n), b.slice(0, n)];
}

export function Sparkline({ current = [], previous = [] }) {
  const [c, p] = align(current, previous);
  const all = [...c, ...p];
  const min = Math.min(...all, 0);
  const max = Math.max(...all, 0.0001);
  const norm = (arr) => arr.map((v) => (v - min) / (max - min));
  const cN = norm(c);
  const pN = norm(p);
  const pathC = buildSparklinePath(cN, W, H);
  const pathP = buildSparklinePath(pN, W, H);

  return (
    <svg
      className="analytics-spark"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={pathP}
        fill="none"
        stroke="color-mix(in srgb, var(--gold) 60%, transparent)"
        strokeWidth="1.5"
        opacity={0.45}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={pathC}
        fill="none"
        stroke="var(--live)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        style={{ filter: 'drop-shadow(0 0 4px color-mix(in srgb, var(--live) 40%, transparent))' }}
      />
    </svg>
  );
}
