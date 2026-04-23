/** Global / platform ad — targetSellerId empty or __all__ */
export const AD_TARGET_ALL = '__all__';

/** Internal placement keys for fetch + cache */
export const AD_PLACEMENTS = {
  HOME: 'home',
  DASHBOARD: 'dashboard',
};

/** Shown when no active Firestore ad; matches legacy static copy. */
export const AD_STATIC_FALLBACK = {
  title: 'Advertisements & Promos Banner',
  line: 'Placeholder Image',
};

/** Session cache for ad fetches (avoids re-query on every route change). */
export const ADS_CACHE_TTL_MS = 120_000;
