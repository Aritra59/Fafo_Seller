import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getResolvedAdTargetId, recordAdClick } from '../../services/adsService';

const AUTO_MS = 10_000;

/**
 * Image carousel: auto-advances every 10s when multiple ads; thin scrub bar overlaid at bottom for manual control.
 * @param {object} props
 * @param {Array<{ id: string, imageUrl: string, ctaLink?: string, ad?: object }>} props.slides
 * @param {string} [props.placement]
 * @param {string | null} [props.viewerSellerId]
 */
export function AdImageCarousel({ slides, placement = 'dashboard', viewerSellerId = null }) {
  const scrubRef = useRef(null);
  const touchRef = useRef({ x: 0, y: 0 });
  const [activeIndex, setActiveIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      ? true
      : false,
  );

  const n = slides?.length ?? 0;
  const slideIds = useMemo(() => slides.map((s) => s.id).join('|'), [slides]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduceMotion(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [slideIds]);

  useEffect(() => {
    if (n <= 1 || reduceMotion) return undefined;
    const id = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % n);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [n, reduceMotion, slideIds]);

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

  const onScrubPointerDown = useCallback(
    (e) => {
      if (n <= 1) return;
      const track = scrubRef.current;
      if (!track) return;
      e.preventDefault();
      const pid = e.pointerId;
      try {
        track.setPointerCapture(pid);
      } catch {
        /* not supported */
      }
      const update = (clientX) => {
        const rect = track.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const ratio = rect.width > 0 ? x / rect.width : 0;
        const idx = Math.min(n - 1, Math.max(0, Math.floor(ratio * n)));
        setActiveIndex(idx);
      };
      update(e.clientX);
      const onMove = (ev) => {
        if (ev.pointerId !== pid) return;
        update(ev.clientX);
      };
      const onUp = (ev) => {
        if (ev.pointerId !== pid) return;
        track.removeEventListener('pointermove', onMove);
        track.removeEventListener('pointerup', onUp);
        track.removeEventListener('pointercancel', onUp);
        try {
          track.releasePointerCapture(pid);
        } catch {
          /* */
        }
      };
      track.addEventListener('pointermove', onMove);
      track.addEventListener('pointerup', onUp);
      track.addEventListener('pointercancel', onUp);
    },
    [n],
  );

  const onScrubKeyDown = useCallback(
    (e) => {
      if (n <= 1) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + n) % n);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % n);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(n - 1);
      }
    },
    [n],
  );

  const onTouchStart = useCallback((e) => {
    const t = e.touches[0];
    if (!t) return;
    touchRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e) => {
      if (n <= 1) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - touchRef.current.x;
      const dy = t.clientY - touchRef.current.y;
      if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) setActiveIndex((i) => (i + 1) % n);
      else setActiveIndex((i) => (i - 1 + n) % n);
    },
    [n],
  );

  if (!slides?.length) return null;

  const txPct = n > 0 ? (-activeIndex / n) * 100 : 0;
  const thumbW = n > 0 ? 100 / n : 100;
  const thumbLeft = n > 0 ? (activeIndex / n) * 100 : 0;

  return (
    <div
      className="ad-image-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Promotional banners"
    >
      <div
        className="ad-image-carousel__viewport"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className={`ad-image-carousel__strip${reduceMotion ? ' ad-image-carousel__strip--no-motion' : ''}`}
          style={{
            width: `${n * 100}%`,
            transform: `translateX(${txPct}%)`,
          }}
        >
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
            const basis = `${100 / n}%`;
            if (hasCta) {
              return (
                <button
                  key={slide.id}
                  type="button"
                  className="ad-image-carousel__slide"
                  style={{ flex: `0 0 ${basis}` }}
                  onClick={() => onActivate(slide)}
                  aria-label="Open promotion"
                >
                  {img}
                </button>
              );
            }
            return (
              <div
                key={slide.id}
                className="ad-image-carousel__slide ad-image-carousel__slide--static"
                style={{ flex: `0 0 ${basis}` }}
              >
                {img}
              </div>
            );
          })}
        </div>

        {n > 1 ? (
          <div
            ref={scrubRef}
            className="ad-image-carousel__scrub"
            role="slider"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={n - 1}
            aria-valuenow={activeIndex}
            aria-label="Choose promotion slide"
            tabIndex={0}
            onPointerDown={onScrubPointerDown}
            onKeyDown={onScrubKeyDown}
          >
            <span
              className="ad-image-carousel__scrub-thumb"
              style={{ width: `${thumbW}%`, left: `${thumbLeft}%` }}
              aria-hidden
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
