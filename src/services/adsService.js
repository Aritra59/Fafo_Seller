/**
 * Firestore `ads` — v2 and legacy.
 * - active (bool) | legacy isActive
 * - placementHome, placementDashboard (bools) — or string "true" / legacy placement
 * - bannerUrlHome, bannerUrlDashboard, bannerUrl, banner, imageUrl
 * - startAt, endAt | startDate, endDate
 * - ctaText, ctaLink
 * - targetSellerId | targetSeller | sellerId — omit / all = global
 */
import { addDoc, collection, getDocs, limit, query, serverTimestamp, where } from 'firebase/firestore';
import { ADS_CACHE_TTL_MS, AD_TARGET_ALL } from '../constants/ads';
import { db } from '../firebase';

const loadCache = new Map();
const dashboardBySeller = new Map();
const homePublicCache = { at: 0, data: null };

/** "All sellers" / global: explicit markers or no target in doc */
const ALL_SELLER_MARKERS = new Set(
  [AD_TARGET_ALL, 'all', 'global', '*', '__all__', 'any'].map((s) => String(s).toLowerCase()),
);

function toMillis(v) {
  if (v == null) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'object' && typeof v.seconds === 'number') {
    return v.seconds * 1000 + (typeof v.nanoseconds === 'number' ? v.nanoseconds / 1e6 : 0);
  }
  return null;
}

/**
 * @param {object} ad
 * @param {number} [now]
 */
export function isAdInActiveWindow(ad, now = Date.now()) {
  const s = toMillis(ad.startAt ?? ad.startDate);
  const e = toMillis(ad.endAt ?? ad.endDate);
  if (s != null && now < s) return false;
  if (e != null && now > e) return false;
  return true;
}

function isRowActive(ad) {
  if (ad.active === true) return true;
  if (ad.isActive === true) return true;
  return false;
}

/** Boolean true or string "true" (Firestore quirks). */
export function isTruthyBool(v) {
  if (v === true) return true;
  if (typeof v === 'string' && v.trim().toLowerCase() === 'true') return true;
  return false;
}

export function matchesPlacementDashboard(ad) {
  if (isTruthyBool(ad.placementDashboard)) return true;
  if (String(ad.placement || '') === 'seller_dashboard_banner') return true;
  return false;
}

export function matchesPlacementHome(ad) {
  if (isTruthyBool(ad.placementHome)) return true;
  if (String(ad.placement || '') === 'seller_home_banner') return true;
  return false;
}

/**
 * First set target: targetSellerId → targetSeller → sellerId (per brief).
 * @param {object} ad
 * @returns {string | null} null = no field set = global
 */
export function getResolvedAdTargetId(ad) {
  if (!ad) return null;
  for (const k of ['targetSellerId', 'targetSeller', 'sellerId']) {
    if (!Object.prototype.hasOwnProperty.call(ad, k)) continue;
    const v = ad[k];
    if (v == null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    if (typeof v === 'string') return v.trim();
    if (v != null) return String(v).trim();
  }
  return null;
}

export function isGlobalOrAllSellersAd(ad) {
  const t = getResolvedAdTargetId(ad);
  if (t == null) return true;
  if (ALL_SELLER_MARKERS.has(t.toLowerCase())) return true;
  return false;
}

/**
 * @param {object} ad
 * @param {string} sellerDocumentId — Firestore `sellers` doc id
 */
export function adIsVisibleToSellerOnDashboard(ad, sellerDocumentId) {
  if (!isRowActive(ad)) return false;
  if (!isAdInActiveWindow(ad)) return false;
  if (!matchesPlacementDashboard(ad)) return false;
  if (!getDashboardImageFromAd(ad)) return false;
  const sid = String(sellerDocumentId ?? '').trim();
  if (!sid) return false;
  if (isGlobalOrAllSellersAd(ad)) return true;
  const t = getResolvedAdTargetId(ad);
  return Boolean(t && t === sid);
}

/**
 * Public landing: home placement, global / all, in window.
 * @param {object} ad
 */
export function adIsVisibleOnPublicHome(ad) {
  if (!isRowActive(ad)) return false;
  if (!isAdInActiveWindow(ad)) return false;
  if (!matchesPlacementHome(ad)) return false;
  if (!getHomeImageFromAd(ad)) return false;
  return isGlobalOrAllSellersAd(ad);
}

function getCreatedAtMs(a) {
  const c = a?.createdAt;
  if (c && typeof c.toMillis === 'function') return c.toMillis();
  return 0;
}

function getPriorityNum(a) {
  const p = a?.priority;
  const n = Number(p);
  return Number.isFinite(n) ? n : 0;
}

/** Sort: priority asc, then createdAt desc */
export function sortAdsForDisplay(ads) {
  return [...ads].sort((a, b) => {
    const pa = getPriorityNum(a);
    const pb = getPriorityNum(b);
    if (pa !== pb) return pa - pb;
    return getCreatedAtMs(b) - getCreatedAtMs(a);
  });
}

/** @param {object} ad */
function getDashboardImageFromAd(ad) {
  for (const k of ['bannerUrlDashboard', 'bannerUrl', 'banner', 'imageUrl']) {
    const u = ad[k];
    if (typeof u === 'string' && u.trim()) return u.trim();
  }
  return null;
}

/** @param {object} ad */
export function getHomeImageFromAd(ad) {
  for (const k of ['bannerUrlHome', 'bannerUrlDashboard', 'bannerUrl', 'banner', 'imageUrl']) {
    const u = ad[k];
    if (typeof u === 'string' && u.trim()) return u.trim();
  }
  return null;
}

/**
 * @param {'home' | 'dashboard'} which
 * @param {object} ad
 */
export function getAdImageUrl(ad, which) {
  if (!ad) return null;
  if (which === 'dashboard') {
    return getDashboardImageFromAd(ad);
  }
  return getHomeImageFromAd(ad);
}

function mapDoc(d) {
  const data = d.data();
  return { id: d.id, ...data };
}

async function loadAllActiveAdRows_({ skipCache = false } = {}) {
  const key = 'all';
  if (!skipCache) {
    const hit = loadCache.get(key);
    if (hit && Date.now() - hit.at < ADS_CACHE_TTL_MS) {
      return hit.rows;
    }
  }

  let snap;
  try {
    snap = await getDocs(query(collection(db, 'ads'), where('active', '==', true), limit(200)));
  } catch {
    snap = { docs: [] };
  }
  if (!snap.docs?.length) {
    try {
      snap = await getDocs(query(collection(db, 'ads'), where('isActive', '==', true), limit(200)));
    } catch {
      snap = { docs: [] };
    }
  }
  if (!snap.docs?.length) {
    try {
      snap = await getDocs(query(collection(db, 'ads'), limit(250)));
    } catch {
      return [];
    }
  }
  const rows = snap.docs.map(mapDoc).filter(isRowActive);
  if (!skipCache) {
    loadCache.set(key, { at: Date.now(), rows });
  }
  return rows;
}

function toSlide(ad) {
  const link =
    typeof ad.ctaLink === 'string' && ad.ctaLink.trim() ? ad.ctaLink.trim() : '';
  return { id: ad.id, ad, ctaLink: link };
}

/**
 * Dashboard: placementDash + in window + target matches seller OR global + has image
 * @param {string} sellerDocId
 */
export async function fetchDashboardAdsForSeller(sellerDocId, opt = {}) {
  const { skipCache = false } = opt;
  const sid = String(sellerDocId ?? '').trim();
  if (!skipCache) {
    const h = dashboardBySeller.get(sid);
    if (h && Date.now() - h.at < ADS_CACHE_TTL_MS) {
      return h.data;
    }
  }

  const allActive = await loadAllActiveAdRows_({ skipCache });

  // eslint-disable-next-line no-console
  console.log('Current Seller ID:', sid);
  // eslint-disable-next-line no-console
  console.log('All Ads:', allActive);

  const matched = allActive.filter((a) => adIsVisibleToSellerOnDashboard(a, sid));
  const sorted = sortAdsForDisplay(matched).map((a) => ({ ...toSlide(a), imageUrl: getDashboardImageFromAd(a) })).filter((r) => r.imageUrl);

  // eslint-disable-next-line no-console
  console.log('Matched Dashboard Ads:', sorted);

  if (!skipCache) {
    dashboardBySeller.set(sid, { at: Date.now(), data: sorted });
  }
  return sorted;
}

/** @deprecated use fetchDashboardAdsForSeller — same shape */
export async function fetchSellerOnlyDashboardAds(sellerId, opt = {}) {
  return fetchDashboardAdsForSeller(sellerId, opt);
}

/**
 * Public / seller landing: home + global, no seller filter.
 */
export async function fetchHomePagePublicAds(opt = {}) {
  const { skipCache = false } = opt;
  if (!skipCache) {
    if (homePublicCache.data && Date.now() - homePublicCache.at < ADS_CACHE_TTL_MS) {
      return homePublicCache.data;
    }
  }

  const allActive = await loadAllActiveAdRows_({ skipCache });
  const matched = allActive.filter((a) => adIsVisibleOnPublicHome(a));
  const sorted = sortAdsForDisplay(matched)
    .map((a) => ({ ...toSlide(a), imageUrl: getHomeImageFromAd(a) }))
    .filter((r) => r.imageUrl);

  if (!skipCache) {
    homePublicCache.data = sorted;
    homePublicCache.at = Date.now();
  }
  return sorted;
}

/**
 * @param {'home' | 'dashboard'} which
 * @param {{ sellerId?: string | null, skipCache?: boolean }} [opt]
 */
export async function fetchAdForPlacement(which, opt = {}) {
  const { sellerId = null, skipCache = false } = opt;
  if (which === 'dashboard') {
    if (!sellerId) return null;
    const list = await fetchDashboardAdsForSeller(sellerId, { skipCache });
    return list.length ? list[0].ad : null;
  }
  if (which === 'home') {
    const list = await fetchHomePagePublicAds({ skipCache });
    return list.length ? list[0].ad : null;
  }
  return null;
}

/**
 * @param {object} payload
 */
export function recordAdClick(payload) {
  return addDoc(collection(db, 'adClicks'), {
    adId: payload.adId,
    placement: payload.placement,
    sellerViewerId: payload.sellerViewerId ?? null,
    targetSellerId: payload.targetSellerId ?? null,
    href: payload.href,
    at: serverTimestamp(),
  }).catch(() => {});
}

export function invalidateAdCache() {
  loadCache.clear();
  dashboardBySeller.clear();
  homePublicCache.data = null;
  homePublicCache.at = 0;
}

export function getAdTitle(ad) {
  if (!ad) return 'Promo';
  const t = ad.title;
  if (t != null && String(t).trim()) return String(t).trim();
  const c = ad.ctaText;
  if (c != null && String(c).trim()) return String(c).trim();
  return 'Promo';
}

