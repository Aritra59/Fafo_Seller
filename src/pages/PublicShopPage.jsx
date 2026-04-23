import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getBuyerPublicBase } from '../utils/publicShopUrl';
import { normalizeShopCode } from '../utils/shopCode';

/**
 * Seller app hosts `/shop/:code` and `/s/:slug` only to forward to the **buyer** storefront.
 * Always redirects to an absolute URL on the buyer origin (never stays on seller).
 */
export function PublicShopPage() {
  const { code, slug } = useParams();
  const [searchParams] = useSearchParams();
  const searchStr = searchParams.toString();

  useEffect(() => {
    const base = getBuyerPublicBase();
    let path = '';
    if (code && String(code).length) {
      path = `/shop/${encodeURIComponent(normalizeShopCode(code))}`;
    } else if (slug && String(slug).length) {
      path = `/s/${encodeURIComponent(String(slug).trim().toLowerCase())}`;
    }
    if (!path) {
      return;
    }
    const qs = searchStr ? `?${searchStr}` : '';
    let target;
    try {
      target = new URL(`${path}${qs}`, base).href;
    } catch {
      target = `${String(base).replace(/\/$/, '')}${path}${qs}`;
    }
    window.location.replace(target);
  }, [code, slug, searchStr]);

  return (
    <div className="public-shop-page" style={{ padding: '1.25rem' }}>
      <p className="muted" style={{ margin: 0 }}>Opening your shop…</p>
    </div>
  );
}
