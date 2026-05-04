import { useCallback, useMemo } from 'react';
import QRCode from 'qrcode';
import { normalizeShopCode } from '../utils/shopCode';
import { getBaseUrl, getPublicShopUrl } from '../utils/url';
import { downloadPublicShopQrPng } from '../utils/shopQr';

/**
 * @param {object | null | undefined} seller
 */
export function usePublicShopActionHandlers(seller) {
  const code = useMemo(
    () => (seller ? normalizeShopCode(seller.shopCode ?? seller.code ?? '') : ''),
    [seller],
  );
  const slug = useMemo(() => String(seller?.shopSlug ?? '').trim(), [seller?.shopSlug]);
  const publicIdentifier = slug || code;
  const baseUrl = getBaseUrl();
  const shareUrl = useMemo(() => getPublicShopUrl(seller), [seller, baseUrl]);
  const qrUrlString = shareUrl;
  const shopName = useMemo(
    () => (typeof seller?.shopName === 'string' && seller.shopName.trim() ? seller.shopName.trim() : 'our shop'),
    [seller?.shopName],
  );

  const copy = useCallback(async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt('Copy', text);
    }
  }, []);

  return {
    copyLink: () => {
      if (!shareUrl) return;
      const text = `Order directly from ${shopName}\n${shareUrl}`;
      void copy(text);
    },
    shareUrl,
    printShopQr: async () => {
      if (!qrUrlString) return;
      try {
        const qrDataUrl = await QRCode.toDataURL(qrUrlString, {
          margin: 2,
          width: 280,
          color: { dark: '#0c0e12ff', light: '#ffffffff' },
        });
        const w = window.open('', '_blank');
        if (!w) {
          if (publicIdentifier) {
            const safe = `fafo-qr-${publicIdentifier.toLowerCase()}.png`;
            void downloadPublicShopQrPng(qrUrlString, safe);
          }
          return;
        }
        w.document.write(
          `<!doctype html><html><head><title>Print QR</title><style>body{margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;}img{max-width:100vmin;}</style></head><body><img src="${qrDataUrl}" alt="Shop QR" onload="setTimeout(function(){print();},300)" /></body></html>`,
        );
        w.document.close();
      } catch {
        if (publicIdentifier) {
          const safe = `fafo-qr-${publicIdentifier.toLowerCase()}.png`;
          void downloadPublicShopQrPng(qrUrlString, safe);
        }
      }
    },
    downloadQr: () => {
      if (publicIdentifier && qrUrlString) {
        const safe = `fafo-qr-${publicIdentifier.toLowerCase()}.png`;
        void downloadPublicShopQrPng(qrUrlString, safe);
      }
    },
    shareNative: async () => {
      const text = `Order directly from ${shopName}\n${shareUrl}`;
      if (shareUrl && typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: shopName,
            text,
            url: shareUrl,
          });
        } catch {
          /* user cancelled */
        }
      } else {
        void copy(text);
      }
    },
  };
}
