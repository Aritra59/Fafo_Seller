import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { isDemoExplorer } from '../constants/demoMode';
import { logShopVisit } from '../services/firestore';
import { normalizeShopCode } from '../utils/shopCode';
import { getBaseUrl, getPublicShopUrl } from '../utils/url';
import { buildPublicShopQrPngBlob, downloadPublicShopQrPng } from '../utils/shopQr';

/**
 * @param {object} props
 * @param {object | null} props.seller
 * @param {string | null} [props.sellerId]
 * @param {boolean} props.readOnly
 */
export function PublicShopAccessSection({ seller, sellerId: sid, readOnly = false }) {
  const [copyMsg, setCopyMsg] = useState('');
  const [qrPreviewDataUrl, setQrPreviewDataUrl] = useState('');

  const code = useMemo(
    () => (seller ? normalizeShopCode(seller.shopCode ?? seller.code ?? '') : ''),
    [seller],
  );
  const slug = useMemo(() => String(seller?.shopSlug ?? '').trim(), [seller?.shopSlug]);
  const publicIdentifier = slug || code;
  const baseUrl = getBaseUrl();
  const publicShopUrl = useMemo(() => getPublicShopUrl(seller), [seller, baseUrl]);
  const shareUrl = publicShopUrl;
  const qrUrlString = publicShopUrl;

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

  useEffect(() => {
    if (!qrUrlString) {
      setQrPreviewDataUrl('');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const dataUrl = await QRCode.toDataURL(qrUrlString, {
          margin: 2,
          width: 280,
          color: { dark: '#0c0e12ff', light: '#ffffffff' },
        });
        if (!cancelled) setQrPreviewDataUrl(dataUrl);
      } catch {
        if (!cancelled) setQrPreviewDataUrl('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qrUrlString]);

  const onDownloadQr = useCallback(() => {
    if (!publicIdentifier || !qrUrlString) return;
    const safe = `fafo-shop-qr-${publicIdentifier.toLowerCase()}.png`;
    void downloadPublicShopQrPng(qrUrlString, safe);
  }, [publicIdentifier, qrUrlString]);

  const onPrintQr = useCallback(() => {
    if (!qrPreviewDataUrl) {
      onDownloadQr();
      return;
    }
    const w = window.open('', '_blank');
    if (!w) {
      onDownloadQr();
      return;
    }
    w.document.write(
      `<!doctype html><html><head><title>Print QR</title><style>body{margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;}img{max-width:100vmin;}</style></head><body><img src="${qrPreviewDataUrl}" alt="Shop QR" onload="setTimeout(function(){print();},300)" /></body></html>`,
    );
    w.document.close();
  }, [qrPreviewDataUrl, onDownloadQr]);

  const onPreview = useCallback(() => {
    if (!publicIdentifier) return;
    const url = `${getBaseUrl()}/s/${encodeURIComponent(publicIdentifier)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    const id = String(sid ?? '').trim();
    if (id && !isDemoExplorer()) {
      const dev = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      void logShopVisit({ sellerId: id, source: 'link', device: dev, path: 'settings_preview' });
    }
  }, [publicIdentifier, sid]);

  const onShareWhatsapp = useCallback(async () => {
    const id = String(sid ?? '').trim();
    if (id && !isDemoExplorer()) {
      const dev = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      void logShopVisit({ sellerId: id, source: 'whatsapp', device: dev, path: 'settings_whatsapp_share' });
    }
    if (!publicIdentifier || !qrUrlString || !publicShopUrl) {
      return;
    }
    const line1 = `Order directly from ${shopName}`;
    const text = `${line1}\n${publicShopUrl}`;
    const safe = `fafo-shop-qr-${publicIdentifier.toLowerCase()}.png`;
    try {
      const blob = await buildPublicShopQrPngBlob(qrUrlString);
      const file = new File([blob], safe, { type: 'image/png' });
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title: line1, text, files: [file] });
          return;
        }
      }
    } catch {
      // fall back below
    }
    const extra = `${text}\n\nTip: if the image did not attach, use Download QR above and send it in WhatsApp.`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(extra)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }, [publicIdentifier, qrUrlString, publicShopUrl, shopName, sid]);

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

  if (!seller || !publicIdentifier) {
    return (
      <div className="card stack" style={{ marginBottom: '0.75rem' }}>
        <h2 className="settings-section-h2" style={{ margin: 0, fontSize: '1rem' }}>
          Public shop access
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
          Your public menu link and QR will appear after setup.
        </p>
      </div>
    );
  }

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
      <div className="add-item-field" style={{ margin: 0 }}>
        <span className="label">Shop link</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <input className="input" readOnly value={publicShopUrl} style={{ flex: '1 1 12rem' }} />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={readOnly}
            onClick={() => void copy(publicShopUrl)}
          >
            Copy link
          </button>
        </div>
      </div>
      {copyMsg ? <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>{copyMsg}</p> : null}
      <div className="add-item-field" style={{ margin: 0 }}>
        <span className="label">QR code</span>
        {qrPreviewDataUrl ? (
          <img
            src={qrPreviewDataUrl}
            alt="QR code for your shop link"
            className="settings-qr-preview"
            style={{ maxWidth: 200, display: 'block' }}
            loading="lazy"
          />
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
            Your QR will appear here shortly. If it is still missing, refresh this page.
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
        <button
          type="button"
          className="btn btn-ghost"
          disabled={readOnly}
          aria-label="Share on WhatsApp"
          onClick={() => void onShareWhatsapp()}
        >
          Share WhatsApp
        </button>
        <button type="button" className="btn btn-ghost" disabled={readOnly} onClick={onShare}>
          Share
        </button>
      </div>
    </section>
  );
}
