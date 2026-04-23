import { useCallback, useMemo, useState } from 'react';
import { isDemoExplorer } from '../constants/demoMode';
import { logShopVisit } from '../services/firestore';
import { normalizeShopCode } from '../utils/shopCode';
import {
  appendStorefrontSource,
  publicShopByCodeUrl,
  publicShopBySlugUrl,
  publicShopQrTargetUrl,
  publicShopShareUrl,
  publicShopWhatsappLineUrl,
} from '../utils/publicShopUrl';
import { downloadPublicShopQrPng } from '../utils/shopQr';

/**
 * @param {object} props
 * @param {object | null} props.seller
 * @param {string | null} [props.sellerId]
 * @param {boolean} props.readOnly
 */
export function PublicShopAccessSection({ seller, sellerId: sid, readOnly = false }) {
  const [copyMsg, setCopyMsg] = useState('');

  const code = useMemo(
    () => (seller ? normalizeShopCode(seller.shopCode ?? seller.code ?? '') : ''),
    [seller],
  );
  const slug = useMemo(
    () =>
      (seller && typeof seller.shopSlug === 'string' && seller.shopSlug.trim()
        ? seller.shopSlug.trim().toLowerCase()
        : ''
      ).trim(),
    [seller],
  );

  const linkByCode = useMemo(() => (code ? publicShopByCodeUrl(code) : ''), [code]);
  const linkBySlug = useMemo(() => (slug ? publicShopBySlugUrl(slug) : ''), [slug]);
  const shareUrl = useMemo(() => (code ? publicShopShareUrl(code) : ''), [code]);
  const qrUrlString = useMemo(
    () => (code ? publicShopQrTargetUrl(code) : ''),
    [code],
  );
  const storedQr = useMemo(
    () => (typeof seller?.qrUrl === 'string' && seller.qrUrl.trim() ? seller.qrUrl.trim() : ''),
    [seller?.qrUrl],
  );

  const shopName = useMemo(
    () => (typeof seller?.shopName === 'string' && seller.shopName.trim() ? seller.shopName.trim() : 'our shop'),
    [seller?.shopName],
  );

  const copy = useCallback(async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg('Copied to clipboard');
      window.setTimeout(() => setCopyMsg(''), 2500);
    } catch {
      window.prompt('Copy this link', text);
    }
  }, []);

  const onDownloadQr = useCallback(() => {
    if (!code || !qrUrlString) return;
    const safe = `fafo-shop-qr-${code.toLowerCase()}.png`;
    void downloadPublicShopQrPng(qrUrlString, safe);
  }, [code, qrUrlString]);

  const onPrintQr = useCallback(() => {
    if (!storedQr) {
      onDownloadQr();
      return;
    }
    const w = window.open('', '_blank');
    if (!w) {
      onDownloadQr();
      return;
    }
    w.document.write(
      `<!doctype html><html><head><title>Print QR</title><style>body{margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;}img{max-width:100vmin;}</style></head><body><img src="${storedQr}" alt="Shop QR" onload="setTimeout(function(){print();},300)" /></body></html>`,
    );
    w.document.close();
  }, [storedQr, onDownloadQr]);

  const onPreview = useCallback(() => {
    if (!code) return;
    const url = linkByCode ? appendStorefrontSource(linkByCode, 'link') : '';
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
    const id = String(sid ?? '').trim();
    if (id && !isDemoExplorer()) {
      const dev = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      void logShopVisit({ sellerId: id, source: 'link', device: dev, path: 'settings_preview' });
    }
  }, [code, linkByCode, sid]);

  const onWhatsappClick = useCallback(() => {
    const id = String(sid ?? '').trim();
    if (id && !isDemoExplorer()) {
      const dev = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      void logShopVisit({ sellerId: id, source: 'whatsapp', device: dev, path: 'settings_whatsapp_share' });
    }
  }, [sid]);

  const onShare = useCallback(async () => {
    if (!shareUrl) return;
    const text = `Order directly from ${shopName}\n${shareUrl}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: shopName,
          text,
          url: shareUrl,
        });
      } catch {
        return;
      }
    } else {
      void copy(text);
    }
  }, [shareUrl, copy, shopName]);

  if (!seller || !code) {
    return (
      <div className="card stack" style={{ marginBottom: '0.75rem' }}>
        <h2 className="settings-section-h2" style={{ margin: 0, fontSize: '1rem' }}>
          Public shop access
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
          A shop code will appear after setup. It is used to build your public menu link and QR
          code.
        </p>
      </div>
    );
  }

  const waLineUrl = publicShopWhatsappLineUrl(code);
  const wa = `https://wa.me/?text=${encodeURIComponent(
    `Order directly from ${shopName}\n${waLineUrl}`,
  )}`;

  return (
    <section
      className="card stack public-shop-access"
      style={{ marginBottom: '0.9rem' }}
      aria-label="Public shop access"
    >
      <h2
        className="settings-section-h2"
        style={{ margin: 0, fontSize: '1rem' }}
      >
        Public shop access
      </h2>
      <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
        Links and QR open your <strong>buyer storefront</strong> (full ordering). Dev default:{' '}
        <code style={{ color: 'var(--text)' }}>http://localhost:3000/shop/…</code> — set{' '}
        <code style={{ color: 'var(--text)' }}>VITE_BUYER_STOREFRONT_BASE</code> for production.
      </p>
      {copyMsg ? <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>{copyMsg}</p> : null}
      <div className="add-item-field" style={{ margin: 0 }}>
        <span className="label">Shop link (code)</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <input className="input" readOnly value={linkByCode} style={{ flex: '1 1 12rem' }} />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={readOnly}
            onClick={() => void copy(linkByCode)}
          >
            Copy link
          </button>
        </div>
      </div>
      {linkBySlug ? (
        <div className="add-item-field" style={{ margin: 0 }}>
          <span className="label">Short link (slug)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <input className="input" readOnly value={linkBySlug} style={{ flex: '1 1 12rem' }} />
            <button
              type="button"
              className="btn btn-ghost"
              disabled={readOnly}
              onClick={() => void copy(linkBySlug)}
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}
      <div className="add-item-field" style={{ margin: 0 }}>
        <span className="label">QR code (buyer storefront)</span>
        {storedQr ? (
          <img
            src={storedQr}
            alt="QR to open your buyer storefront"
            className="settings-qr-preview"
            style={{ maxWidth: 200, display: 'block' }}
            loading="lazy"
          />
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
            Your QR is generated a short time after you open the dashboard. Pull to refresh if it is
            still missing.
          </p>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={readOnly}
          onClick={onDownloadQr}
        >
          Download QR
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={readOnly}
          onClick={onPrintQr}
        >
          Print QR
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={readOnly}
          onClick={onPreview}
        >
          Preview customer shop
        </button>
        <a
          className="btn btn-ghost"
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on WhatsApp"
          onClick={onWhatsappClick}
        >
          Share WhatsApp
        </a>
        <button type="button" className="btn btn-ghost" disabled={readOnly} onClick={onShare}>
          Share
        </button>
      </div>
    </section>
  );
}
