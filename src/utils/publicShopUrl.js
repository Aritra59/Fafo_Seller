import { normalizeShopCode } from './shopCode';

const DEFAULT_BUYER_PROD = 'https://buyer.yourdomain.com';
const DEFAULT_BUYER_DEV = 'http://localhost:3000';

/**
 * Base URL of the **buyer** storefront (separate from this seller dashboard).
 * - Set `VITE_BUYER_STOREFRONT_BASE` or `VITE_BUYER_PUBLIC_BASE` in .env
 * - Dev: defaults to `http://localhost:3000`
 * - Prod: defaults to `https://buyer.yourdomain.com` (set env to your real buyer host)
 * @returns {string}
 */
export function getBuyerPublicBase() {
  const b = import.meta.env.VITE_BUYER_STOREFRONT_BASE || import.meta.env.VITE_BUYER_PUBLIC_BASE;
  if (typeof b === 'string' && b.trim()) {
    return b.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return DEFAULT_BUYER_DEV;
  }
  return DEFAULT_BUYER_PROD;
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
 * QR: buyer storefront URL only (no `src` query) — “full buyer experience” in buyer app.
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
