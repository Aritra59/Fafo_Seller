import { normalizeShopCode } from './shopCode';

/** Production buyer storefront (ordering app). All public links / QR use this unless a valid override env is set. */
export const BUYER_STOREFRONT_DEFAULT = 'https://fafo-buyer.vercel.app';

/** Hosts that must never be used as the buyer storefront base (seller app, dev, placeholders). */
const BLOCKED_BUYER_BASE_HOSTS = new Set([
  'fafo-seller.vercel.app',
  'localhost',
  '127.0.0.1',
]);

function hostLooksLikePlaceholder(host) {
  const h = String(host ?? '').toLowerCase();
  return h.includes('yourdomain.com') || h.includes('buyer.yourdomain');
}

/**
 * Parse env base URL. Returns null if empty, invalid, blocked (seller/dev), or placeholder host.
 * Adds https:// when the scheme is missing.
 * @param {unknown} value
 * @returns {string | null}
 */
function parseBuyerBaseFromEnv(value) {
  let s = String(value ?? '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s.replace(/^\/+/, '')}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    if (BLOCKED_BUYER_BASE_HOSTS.has(host)) return null;
    if (hostLooksLikePlaceholder(host)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Returns true if stored URL should be replaced (wrong host, relative shop path, placeholders).
 * @param {unknown} url
 * @returns {boolean}
 */
export function isLegacyBuyerStorefrontUrl(url) {
  const s = String(url ?? '').trim();
  if (!s) return false;
  if (s.startsWith('/') && (s.startsWith('/shop/') || s.startsWith('/s/'))) return true;
  if (!s.toLowerCase().startsWith('http')) return false;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (BLOCKED_BUYER_BASE_HOSTS.has(host)) return true;
    if (hostLooksLikePlaceholder(host)) return true;
    return false;
  } catch {
    return /localhost|127\.0\.0\.1|yourdomain|fafo-seller\.vercel\.app/i.test(s);
  }
}

/**
 * Canonical buyer storefront origin (no trailing slash).
 * Priority: `VITE_BUYER_PUBLIC_BASE` → `VITE_BUYER_STOREFRONT_BASE` → {@link BUYER_STOREFRONT_DEFAULT}.
 * Env values pointing at the seller app, localhost, or placeholders are ignored.
 * @returns {string}
 */
export function getBuyerPublicBase() {
  const fromPublic = parseBuyerBaseFromEnv(import.meta.env.VITE_BUYER_PUBLIC_BASE);
  const fromLegacy = parseBuyerBaseFromEnv(import.meta.env.VITE_BUYER_STOREFRONT_BASE);
  return fromPublic || fromLegacy || BUYER_STOREFRONT_DEFAULT;
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
  try {
    const u = new URL(String(absoluteUrl).trim());
    u.searchParams.set('src', String(src).slice(0, 32));
    return u.toString();
  } catch {
    return String(absoluteUrl).trim();
  }
}

/**
 * @param {string} code
 * @returns {string} absolute URL to buyer `/shop/CODE` (no tracking param)
 */
export function publicShopByCodeUrl(code) {
  const c = normalizeShopCode(code);
  if (!c) return '';
  return new URL(`/shop/${encodeURIComponent(c)}`, getBuyerPublicBase()).href;
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
  return new URL(`/s/${encodeURIComponent(s)}`, getBuyerPublicBase()).href;
}

/**
 * QR payload: same absolute URL as {@link publicShopByCodeUrl} (no `src` query).
 * @param {string} code
 */
export function publicShopQrTargetUrl(code) {
  return publicShopByCodeUrl(code);
}

/**
 * Copy / generic share — optional `?src=link` for buyer analytics.
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
