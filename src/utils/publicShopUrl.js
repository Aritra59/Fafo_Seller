import { normalizeShopCode } from './shopCode';

/** Live buyer storefront when no env override is set. */
export const BUYER_STOREFRONT_DEFAULT = 'https://fafo-buyer.vercel.app';

/**
 * Returns true if the URL clearly points at an old dev / placeholder buyer host.
 * @param {unknown} url
 * @returns {boolean}
 */
export function isLegacyBuyerStorefrontUrl(url) {
  const s = String(url ?? '').trim().toLowerCase();
  if (!s.startsWith('http')) return false;
  return (
    s.includes('localhost') ||
    s.includes('127.0.0.1') ||
    s.includes('yourdomain.com') ||
    s.includes('buyer.yourdomain.com')
  );
}

/**
 * Base URL of the buyer storefront (separate from this seller app).
 * Priority: `VITE_BUYER_PUBLIC_BASE` → `VITE_BUYER_STOREFRONT_BASE` → {@link BUYER_STOREFRONT_DEFAULT}.
 * Trailing slashes are stripped.
 * @returns {string}
 */
export function getBuyerPublicBase() {
  const fromPublic = import.meta.env.VITE_BUYER_PUBLIC_BASE;
  const fromLegacy = import.meta.env.VITE_BUYER_STOREFRONT_BASE;
  const raw =
    (typeof fromPublic === 'string' && fromPublic.trim() ? fromPublic : '') ||
    (typeof fromLegacy === 'string' && fromLegacy.trim() ? fromLegacy : '');
  if (raw) {
    return raw.replace(/\/$/, '');
  }
  return BUYER_STOREFRONT_DEFAULT;
}

/**
 * @param {string} absoluteUrl
 * @param {string} src
 * @returns {string}
 */
export function appendStorefrontSource(absoluteUrl, src) {
  if (!String(absoluteUrl ?? '').trim()) {
    return '';
  }
  const u = new URL(String(absoluteUrl).trim());
  u.searchParams.set('src', String(src).slice(0, 32));
  return u.toString();
}

/**
 * @param {string} code
 * @returns {string} absolute URL to buyer `/shop/CODE` (no tracking param)
 */
export function publicShopByCodeUrl(code) {
  const c = normalizeShopCode(code);
  if (!c) return '';
  return `${getBuyerPublicBase()}/shop/${encodeURIComponent(c)}`;
}

/**
 * @param {string} slug
 * @returns {string} absolute URL to buyer `/s/slug`
 */
export function publicShopBySlugUrl(slug) {
  const s = String(slug ?? '')
    .trim()
    .toLowerCase();
  if (!s) return '';
  return `${getBuyerPublicBase()}/s/${encodeURIComponent(s)}`;
}

/**
 * QR: same URL as {@link publicShopByCodeUrl} (no `src` query).
 * @param {string} code
 */
export function publicShopQrTargetUrl(code) {
  return publicShopByCodeUrl(code);
}

/**
 * Copy / generic share — includes `?src=link` for buyer `shopVisits` analytics.
 * @param {string} code
 */
export function publicShopShareUrl(code) {
  const u = publicShopByCodeUrl(code);
  if (!u) return '';
  return appendStorefrontSource(u, 'link');
}

/**
 * WhatsApp line URL — `?src=whatsapp` for buyer logging.
 * @param {string} code
 */
export function publicShopWhatsappLineUrl(code) {
  const u = publicShopByCodeUrl(code);
  if (!u) return '';
  return appendStorefrontSource(u, 'whatsapp');
}
