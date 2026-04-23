import { useId } from 'react';

/**
 * Nomad / FaFo brand mark — vector logo with gold gradient tile.
 * @param {{ size?: number, decorative?: boolean }} [props] — if `decorative`, hide from screen readers (e.g. next to visible "FaFo" text).
 */
export function NomadLogo({ size = 112, decorative = false }) {
  const gid = useId().replace(/:/g, '');
  const gradId = `nomad-gold-${gid}`;

  return (
    <div
      className="nomad-logo-tile"
      style={{ width: size, height: size }}
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : 'FaFo'}
    >
      <svg
        viewBox="0 0 88 88"
        width="100%"
        height="100%"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d4a853" />
            <stop offset="50%" stopColor="#b8860b" />
            <stop offset="100%" stopColor="#8b6914" />
          </linearGradient>
        </defs>
        <rect width="88" height="88" rx="16" fill={`url(#${gradId})`} />
        <g fill="none" stroke="#1a1510" strokeWidth="2" opacity="0.45">
          <path d="M44 12 L44 76 M12 44 L76 44 M22 22 L66 66 M66 22 L22 66" />
          <circle cx="44" cy="44" r="28" />
        </g>
        <text
          x="44"
          y="52"
          textAnchor="middle"
          fill="#0d0b08"
          fontSize="18"
          fontWeight="800"
          fontFamily="system-ui, sans-serif"
          letterSpacing="-0.04em"
        >
          NOMAD
        </text>
      </svg>
    </div>
  );
}
