import { useEffect, useState } from 'react';
import { fetchHomePagePublicAds } from '../../services/adsService';
import { AdImageCarousel } from './AdImageCarousel';

/**
 * Home / login: placementHome + global ads. Entire block hidden if none.
 */
export function PublicHomeAdSection() {
  const [slides, setSlides] = useState(/** @type {any[]} */ ([]));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetchHomePagePublicAds();
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
  }, []);

  if (loading) {
    return null;
  }
  if (slides.length === 0) {
    return null;
  }

  return (
    <section
      className="landing-ad public-home-ad"
      aria-label="Advertisements and promotions"
      style={{ width: '100%' }}
    >
      <AdImageCarousel slides={slides} placement="home" viewerSellerId={null} />
    </section>
  );
}
