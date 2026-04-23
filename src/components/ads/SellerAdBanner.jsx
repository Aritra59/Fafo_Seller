import { useCallback, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AD_STATIC_FALLBACK } from '../../constants/ads';
import { usePlacementAd } from '../../hooks/usePlacementAd';
import { getAdImageUrl, getAdTitle, recordAdClick } from '../../services/adsService';

function isInternalHref(href) {
  if (!href || typeof href !== 'string') return false;
  const t = href.trim();
  return t.startsWith('/') && !t.startsWith('//');
}

/**
 * @param {object} props
 * @param {'landing' | 'dashboard'} props.variant
 * @param {string} props.placement
 * @param {string | null} [props.sellerId] current viewer (dashboard); omit on landing
 */
export function SellerAdBanner({ variant, placement, sellerId: viewerSellerId = null }) {
  const isDashboard = variant === 'dashboard';
  const enabled = Boolean(placement) && (!isDashboard || Boolean(viewerSellerId));
  const sid = isDashboard ? viewerSellerId : null;
  const { ad, loading, error } = usePlacementAd(placement, { sellerId: sid, enabled });
  const [imgReady, setImgReady] = useState(false);
  const navigate = useNavigate();
  const headId = useId();

  const hasAd = Boolean(ad && !error);
  const which = isDashboard ? 'dashboard' : 'home';
  const title = hasAd ? getAdTitle(ad) : AD_STATIC_FALLBACK.title;
  const subtitle =
    hasAd && String(ad.subtitle || '')
      .trim()
      ? String(ad.subtitle).trim()
      : null;
  const cta =
    hasAd && String(ad.ctaText || '')
      .trim()
      ? String(ad.ctaText).trim()
      : null;
  const imageUrl = hasAd ? getAdImageUrl(ad, which) : null;
  const ctaLink = hasAd && typeof ad.ctaLink === 'string' && ad.ctaLink.trim() ? ad.ctaLink.trim() : '';

  const showSkeleton = Boolean(loading);
  const showFallbackCopy = !loading && !hasAd;
  const showImage = hasAd && imageUrl;

  const onActivate = useCallback(() => {
    if (!ctaLink) return;
    recordAdClick({
      adId: ad.id,
      placement,
      sellerViewerId: viewerSellerId,
      targetSellerId: ad.targetSellerId ?? null,
      href: ctaLink,
    });
    if (isInternalHref(ctaLink)) {
      navigate(ctaLink);
    } else {
      window.open(ctaLink, '_blank', 'noopener,noreferrer');
    }
  }, [ad, ctaLink, navigate, placement, viewerSellerId]);

  if (isDashboard) {
    const body = (
      <>
        {showImage ? (
          <div className="seller-ad-dash__img-wrap">
            {!imgReady ? <div className="seller-ad-img-ph" aria-hidden /> : null}
            <img
              className="seller-ad-dash__img"
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setImgReady(true)}
              onError={() => setImgReady(true)}
            />
          </div>
        ) : null}
        <div className="seller-ad-dash__text">
          <h2 className="seller-ad-dash__title" id={headId}>
            {title}
          </h2>
          {subtitle ? <p className="seller-ad-dash__sub">{subtitle}</p> : null}
          {showFallbackCopy ? <p className="seller-ad-dash__ph">{AD_STATIC_FALLBACK.line}</p> : null}
          {hasAd && cta && ctaLink ? <span className="seller-ad-dash__cta">{cta}</span> : null}
        </div>
      </>
    );

    return (
      <div className="seller-ad-dash" style={{ minHeight: '8.75rem' }}>
        {showSkeleton ? (
          <div className="seller-ad-skeleton seller-ad-skeleton--dash" aria-hidden>
            <div className="seller-ad-skeleton__glow" />
            <div className="seller-ad-skeleton__shimmer" />
          </div>
        ) : ctaLink ? (
          <button
            type="button"
            className="seller-ad-dash__card seller-ad-dash__card--click"
            onClick={onActivate}
            aria-label={`${title}. ${subtitle ?? ''} ${cta ? String(cta) : 'Open link'}`}
          >
            {body}
          </button>
        ) : (
          <div className="seller-ad-dash__card">{body}</div>
        )}
      </div>
    );
  }

  // Landing — same outer section styles applied by parent (.landing-ad)
  return (
    <div
      className={`landing-ad-inner${hasAd && showImage ? ' landing-ad-inner--with-image' : ''}`}
      style={{ minHeight: '7.5rem' }}
    >
      {showSkeleton ? (
        <div className="seller-ad-skeleton seller-ad-skeleton--landing" aria-hidden>
          <div className="seller-ad-skeleton__glow" />
          <div className="seller-ad-skeleton__shimmer" />
        </div>
      ) : (
        <>
          {showImage ? (
            <div className="landing-ad__media">
              {!imgReady ? <div className="seller-ad-img-ph" aria-hidden /> : null}
              <img
                className="landing-ad__img"
                src={imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                onLoad={() => setImgReady(true)}
                onError={() => setImgReady(true)}
              />
            </div>
          ) : null}
          {hasAd && ctaLink ? (
            <button type="button" className="seller-ad-landing__hit" onClick={onActivate}>
              <p className="landing-ad-title">{title}</p>
              {subtitle ? <p className="landing-ad-sub">{subtitle}</p> : null}
              {cta ? <span className="seller-ad-landing__cta-label">{cta}</span> : null}
            </button>
          ) : hasAd && !ctaLink ? (
            <div className="seller-ad-landing__static" aria-describedby={headId}>
              <p className="landing-ad-title" id={headId}>
                {title}
              </p>
              {subtitle ? <p className="landing-ad-sub">{subtitle}</p> : null}
            </div>
          ) : (
            <div className="seller-ad-landing__static" aria-describedby={headId}>
              <p className="landing-ad-title" id={headId}>
                {AD_STATIC_FALLBACK.title}
              </p>
              <p className="landing-ad-placeholder">{AD_STATIC_FALLBACK.line}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
