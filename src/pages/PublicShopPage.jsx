import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getBuyerPublicBase } from '../utils/publicShopUrl';
import { normalizeShopCode } from '../utils/shopCode';

/**
 * Legacy route on the seller app: redirect to the **buyer** storefront.
 * The full ordering UI lives in the buyer app; this only forwards the same path.
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
    const search = searchStr ? `?${searchStr}` : '';
    const target = `${base}${path}${search}`;
    window.location.replace(target);
  }, [code, slug, searchStr]);

  return (
    <div className="public-shop-page" style={{ padding: '1.25rem' }}>
      <p className="muted" style={{ margin: 0 }}>Opening the buyer storefront…</p>
    </div>
  );
}
