import { useCallback, useEffect, useState } from 'react';
import { fetchAdForPlacement, invalidateAdCache } from '../services/adsService';

/**
 * @param {string} placement
 * @param {{ sellerId?: string | null, enabled?: boolean }} [opt]
 */
export function usePlacementAd(placement, opt = {}) {
  const { sellerId = null, enabled = true } = opt;
  const [ad, setAd] = useState(/** @type {any} */ (null));
  const [loading, setLoading] = useState(/** @type {boolean} */ (true));
  const [error, setError] = useState(/** @type {Error | null} */ (null));

  const refresh = useCallback(async () => {
    if (!enabled || !placement) return;
    invalidateAdCache();
    setAd(null);
    setLoading(true);
    setError(null);
    try {
      const row = await fetchAdForPlacement(placement, { sellerId, skipCache: true });
      setAd(row);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setAd(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, placement, sellerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enabled || !placement) {
        setAd(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const row = await fetchAdForPlacement(placement, { sellerId });
        if (!cancelled) setAd(row);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setAd(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, placement, sellerId]);

  return { ad, loading, error, refresh };
}
