import { useEffect, useState } from 'react';
import { useSeller } from '../../hooks/useSeller';
import { fetchDashboardAdsForSeller } from '../../services/adsService';
import { AdImageCarousel } from './AdImageCarousel';

/**
 * Fetches dashboard ads; hides the whole block (incl. title) when none.
 * Uses Firestore `sellers` document id from useSeller.
 */
export function DashboardAdSection() {
  const { sellerId: sellerDocId } = useSeller();
  const [slides, setSlides] = useState(/** @type {any[]} */ ([]));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sellerDocId) {
      setSlides([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetchDashboardAdsForSeller(sellerDocId);
        if (!cancelled) setSlides(rows || []);
      } catch {
        if (!cancelled) setSlides([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerDocId]);

  if (!sellerDocId) {
    return null;
  }
  if (loading) {
    return null;
  }
  if (slides.length === 0) {
    return null;
  }

  return (
    <section className="seller-dashboard-ad-slot" aria-label="Advertisements and promotions">
      <h2 className="dashboard-v2-section-title">Advertisements &amp; Promos</h2>
      <AdImageCarousel
        slides={slides}
        placement="dashboard"
        viewerSellerId={sellerDocId}
      />
    </section>
  );
}
