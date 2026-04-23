import { clearSellerSessionStorage, persistSellerId } from './session';
import { normalizeShopCode } from '../utils/shopCode';

const LS_KEY = 'fafo_seller_code_session';
/** @deprecated old session storage key */
const SS_KEY = 'fafo_shop_session';

/**
 * @typedef {{ sellerId: string, shopCode: string, phone?: string | null, ownerName?: string | null, shopName?: string | null, authType: 'shopCode' }} SellerCodeSession
 */

/**
 * Persist local seller session (no Firebase Auth). Uses localStorage for durability.
 * @param {{ sellerId: string, shopCode: string, phone?: string | null, ownerName?: string | null, shopName?: string | null }} payload
 */
export function persistSellerCodeSessionLocal(payload) {
  const sellerId = String(payload?.sellerId ?? '').trim();
  const shopCode = normalizeShopCode(String(payload?.shopCode ?? ''));
  if (!sellerId || !shopCode.length) return;
  const entry = {
    sellerId,
    shopCode: shopCode.toUpperCase(),
    phone: payload.phone != null ? String(payload.phone).trim() || null : null,
    ownerName:
      payload.ownerName != null && String(payload.ownerName).trim()
        ? String(payload.ownerName).trim()
        : null,
    shopName:
      payload.shopName != null && String(payload.shopName).trim()
        ? String(payload.shopName).trim()
        : null,
    authType: 'shopCode',
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entry));
    persistSellerId(sellerId);
  } catch {
    /* private mode / quota */
  }
}

/** @returns {SellerCodeSession | null} */
export function readSellerCodeSessionLocal() {
  try {
    const rawL = localStorage.getItem(LS_KEY);
    const rawS = !rawL ? sessionStorage.getItem(SS_KEY) : null;
    const raw = rawL || rawS;
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || o.authType !== 'shopCode') return null;
    const sellerId = String(o.sellerId ?? '').trim();
    const shopCode = String(o.shopCode ?? '').trim().toUpperCase();
    if (!sellerId || !shopCode) return null;
    if (rawS && !rawL) {
      persistSellerCodeSessionLocal({
        sellerId,
        shopCode,
        phone: o.phone,
        ownerName: o.ownerName,
        shopName: o.shopName,
      });
      try {
        sessionStorage.removeItem(SS_KEY);
      } catch {
        /* */
      }
    }
    return {
      sellerId,
      shopCode,
      phone: o.phone != null ? String(o.phone).trim() || null : null,
      ownerName: o.ownerName != null ? String(o.ownerName).trim() || null : null,
      shopName: o.shopName != null ? String(o.shopName).trim() || null : null,
      authType: 'shopCode',
    };
  } catch {
    return null;
  }
}

export function hasSellerCodeSession() {
  return readSellerCodeSessionLocal() != null;
}

export function clearSellerCodeSessionLocal() {
  try {
    localStorage.removeItem(LS_KEY);
    sessionStorage.removeItem(SS_KEY);
  } catch {
    /* */
  }
  clearSellerSessionStorage();
}
