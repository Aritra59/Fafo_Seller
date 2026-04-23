import QRCode from 'qrcode';

/**
 * Build a high-quality PNG (blob) of a public shop URL for Storage upload.
 * @param {string} text
 * @returns {Promise<Blob>}
 */
export async function buildPublicShopQrPngBlob(text) {
  if (!String(text ?? '').trim()) {
    throw new Error('Missing QR text.');
  }
  const dataUrl = await QRCode.toDataURL(String(text).trim(), {
    type: 'image/png',
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 1024,
    color: { dark: '#0c0e12ff', light: '#ffffffff' },
  });
  const res = await fetch(dataUrl);
  if (!res.ok) {
    throw new Error('Could not build QR image.');
  }
  return res.blob();
}

/**
 * Client download / preview (no Storage).
 * @param {string} text
 * @param {string} [filename]
 */
export async function downloadPublicShopQrPng(text, filename = 'fafo-shop-qr.png') {
  const blob = await buildPublicShopQrPngBlob(text);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}
