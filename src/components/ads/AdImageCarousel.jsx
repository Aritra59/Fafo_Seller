import { useCallback } from 'react';
import { getResolvedAdTargetId, recordAdClick } from '../../services/adsService';

/**
 * Image-only horizontal carousel. CTA opens a new tab when set.
 * @param {object} props
 * @param {Array<{ id: string, imageUrl: string, ctaLink?: string, ad?: object }>} props.slides
 * @param {string} [props.placement]
 * @param {string | null} [props.viewerSellerId]
 */
export function AdImageCarousel({ slides, placement = 'dashboard', viewerSellerId = null }) {
  const onActivate = useCallback(
    (slide) => {
      if (!slide?.ctaLink) return;
      const href = slide.ctaLink;
      recordAdClick({
        adId: slide.id,
        placement,
        sellerViewerId: viewerSellerId,
        targetSellerId: getResolvedAdTargetId(slide.ad) ?? null,
        href,
      });
      window.open(href, '_blank', 'noopener,noreferrer');
    },
    [placement, viewerSellerId],
  );

  if (!slides?.length) return null;

  return (
    <div className="ad-image-carousel" aria-label="Promotional banners">
      <div className="ad-image-carousel__track">
        {slides.map((slide) => {
          const img = slide.imageUrl ? (
            <img
              className="ad-image-carousel__img"
              src={slide.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : null;
          const hasCta = Boolean(slide.ctaLink);
          if (hasCta) {
            return (
              <button
                key={slide.id}
                type="button"
                className="ad-image-carousel__slide"
                onClick={() => onActivate(slide)}
                aria-label="Open promotion"
              >
                {img}
              </button>
            );
          }
          return (
            <div key={slide.id} className="ad-image-carousel__slide ad-image-carousel__slide--static">
              {img}
            </div>
          );
        })}
      </div>
    </div>
  );
}
