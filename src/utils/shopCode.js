/**
 * Normalize shop code for lookups and URLs (UPPERCASE, no spaces).
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeShopCode(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}
