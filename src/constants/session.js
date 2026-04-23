/** Persisted Firestore `sellers/{id}` document id (not Auth uid). */
export const SELLER_SESSION_ID_KEY = 'fafo_seller_id';

export function persistSellerId(sellerDocId) {
  if (typeof sellerDocId === 'string' && sellerDocId.trim()) {
    try {
      localStorage.setItem(SELLER_SESSION_ID_KEY, sellerDocId.trim());
    } catch {
      /* ignore quota / private mode */
    }
  }
}

export function readPersistedSellerId() {
  try {
    const v = localStorage.getItem(SELLER_SESSION_ID_KEY);
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function clearSellerSessionStorage() {
  try {
    localStorage.removeItem(SELLER_SESSION_ID_KEY);
  } catch {
    /* ignore */
  }
}
