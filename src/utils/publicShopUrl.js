import { normalizeShopCode } from './shopCode';
import { getBaseUrl, getShopUrl } from './url';

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
    const base = getBaseUrl();
    if (!base) return false;
    const baseHost = new URL(base).hostname.toLowerCase();
    return u.hostname.toLowerCase() !== baseHost;
  } catch {
    return false;
  }
}

/**
 * Canonical public storefront origin from current runtime domain.
 * @returns {string}
 */
export function getBuyerPublicBase() {
  return getBaseUrl();
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
  return getShopUrl(encodeURIComponent(c));
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
  const base = getBuyerPublicBase();
  if (!base) return '';
  return `${base}/s/${encodeURIComponent(s)}`;
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
