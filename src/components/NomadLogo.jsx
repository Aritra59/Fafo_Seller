import nomadBrand from '../assets/WhatsApp Image 2026-04-24 at 8.10.23 PM.jpeg';

/**
 * Nomad / FaFo brand mark — uses the official NOMAD artwork from assets.
 * @param {{ size?: number, decorative?: boolean }} [props] — if `decorative`, hide from screen readers (e.g. next to visible "FaFo" text).
 */
export function NomadLogo({ size = 112, decorative = false }) {
  return (
    <div
      className="nomad-logo-tile nomad-logo-tile--photo"
      style={{ width: size, height: size }}
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : 'FaFo'}
    >
      <img src={nomadBrand} alt="" width={size} height={size} className="nomad-logo-tile__img" />
    </div>
  );
}
