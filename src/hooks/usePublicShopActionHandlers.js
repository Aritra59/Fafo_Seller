import { useCallback, useMemo } from 'react';
import { normalizeShopCode } from '../utils/shopCode';
import { publicShopQrTargetUrl, publicShopShareUrl } from '../utils/publicShopUrl';
import { downloadPublicShopQrPng } from '../utils/shopQr';

/**
 * @param {object | null | undefined} seller
 */
export function usePublicShopActionHandlers(seller) {
  const code = useMemo(
    () => (seller ? normalizeShopCode(seller.shopCode ?? seller.code ?? '') : ''),
    [seller],
  );
  const shareUrl = useMemo(() => (code ? publicShopShareUrl(code) : ''), [code]);
  const qrUrlString = useMemo(() => (code ? publicShopQrTargetUrl(code) : ''), [code]);
  const shopName = useMemo(
    () => (typeof seller?.shopName === 'string' && seller.shopName.trim() ? seller.shopName.trim() : 'our shop'),
    [seller?.shopName],
  );
  const storedQr = useMemo(
    () => (typeof seller?.qrUrl === 'string' && seller.qrUrl.trim() ? seller.qrUrl.trim() : ''),
    [seller?.qrUrl],
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
    printShopQr: () => {
      if (storedQr) {
        const w = window.open('', '_blank');
        if (w) {
          w.document.write(
            `<!doctype html><html><head><title>Print QR</title><style>body{margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;}img{max-width:100vmin;}</style></head><body><img src="${storedQr}" alt="Shop QR" onload="setTimeout(function(){print();},300)" /></body></html>`,
          );
          w.document.close();
        }
      } else if (code && qrUrlString) {
        const safe = `fafo-qr-${code.toLowerCase()}.png`;
        void downloadPublicShopQrPng(qrUrlString, safe);
      }
    },
    downloadQr: () => {
      if (code && qrUrlString) {
        const safe = `fafo-qr-${code.toLowerCase()}.png`;
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
