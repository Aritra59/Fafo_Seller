/** Session for shop-code + anonymous auth (restored on refresh with seller id in localStorage). */
const KEY = 'fafo_shop_session';

/**
 * @param {{ sellerId: string, shopCode: string, phone?: string | null }} payload
 */
export function persistShopCodeSession(payload) {
  const sellerId = String(payload?.sellerId ?? '').trim();
  const shopCode = String(payload?.shopCode ?? '').trim().toUpperCase();
  if (!sellerId || !shopCode) return;
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        sellerId,
        shopCode,
        phone: payload.phone != null ? String(payload.phone).trim() || null : null,
        authType: 'shopCode',
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

/** @returns {{ sellerId: string, shopCode: string, phone: string | null, authType: 'shopCode' } | null} */
export function readShopCodeSession() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || o.authType !== 'shopCode') return null;
    const sellerId = String(o.sellerId ?? '').trim();
    const shopCode = String(o.shopCode ?? '').trim().toUpperCase();
    if (!sellerId || !shopCode) return null;
    return {
      sellerId,
      shopCode,
      phone: o.phone != null ? String(o.phone).trim() || null : null,
      authType: 'shopCode',
    };
  } catch {
    return null;
  }
}

export function clearShopCodeSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
