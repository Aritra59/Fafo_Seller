import {
  isShopOpenNow,
  resolveEffectiveSellerMode,
} from '../services/sellerHelpers';

/**
 * Whether the public catalog should list menu items, or only show the unavailable state.
 * @param {object | null | undefined} seller
 * @returns {{ showCatalog: boolean, message: string | null }}
 */
export function getPublicShopDisplayState(seller) {
  if (!seller) {
    return { showCatalog: false, message: 'Shop not found.' };
  }
  const mode = resolveEffectiveSellerMode(seller);
  if (mode === 'suspended') {
    return { showCatalog: false, message: 'Shop temporarily unavailable.' };
  }
  if (seller.isBlocked === true) {
    return { showCatalog: false, message: 'Shop temporarily unavailable.' };
  }
  const slots = Number(seller.slots ?? 0);
  if (!Number.isFinite(slots) || slots <= 0) {
    return { showCatalog: false, message: 'Shop temporarily unavailable.' };
  }
  const open = isShopOpenNow(seller);
  if (open === false) {
    return { showCatalog: false, message: 'Shop temporarily unavailable.' };
  }
  return { showCatalog: true, message: null };
}
