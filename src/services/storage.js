import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../firebase';

export const SHOP_LOGO_PATH = (sellerId) => `shops/${sellerId}/shop.jpg`;
export const PRODUCT_IMAGE_PATH = (sellerId, productId) =>
  `products/${sellerId}/${productId}.jpg`;

const MAX_EDGE = 1200;
const JPEG_QUALITY = 0.86;

const ACCEPT_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * @param {File} file
 * @returns {boolean}
 */
export function isAcceptedImageType(file) {
  return Boolean(file && ACCEPT_MIME.has(String(file.type || '').toLowerCase()));
}

/**
 * Resize (max width/height MAX_EDGE) and encode as JPEG blob.
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export function compressImageToJpegBlob(file) {
  return new Promise((resolve, reject) => {
    if (!file || !isAcceptedImageType(file)) {
      reject(new Error('Use JPG, PNG, or WebP.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let { width, height } = img;
        if (width < 1 || height < 1) {
          reject(new Error('Invalid image dimensions.'));
          return;
        }
        const scale = Math.min(1, MAX_EDGE / width, MAX_EDGE / height);
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not process image.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Could not compress image.'));
              return;
            }
            resolve(blob);
          },
          'image/jpeg',
          JPEG_QUALITY,
        );
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image file.'));
    };
    img.src = url;
  });
}

/**
 * @param {import('firebase/storage').UploadTask} task
 * @param {(pct: number) => void} [onProgress]
 */
function trackTask(task, onProgress) {
  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        if (snap.totalBytes > 0 && typeof onProgress === 'function') {
          onProgress(Math.round((100 * snap.bytesTransferred) / snap.totalBytes));
        }
      },
      (err) => reject(err),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      },
    );
  });
}

/**
 * Upload shop logo (overwrites `shops/{sellerId}/shop.jpg`).
 * @param {string} sellerId
 * @param {Blob} jpegBlob
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<string>} download URL
 */
export async function uploadShopLogoJpeg(sellerId, jpegBlob, onProgress) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    throw new Error('Missing seller.');
  }
  const r = ref(storage, SHOP_LOGO_PATH(sid));
  const task = uploadBytesResumable(r, jpegBlob, { contentType: 'image/jpeg' });
  return trackTask(task, onProgress);
}

/**
 * Upload product image (overwrites `products/{sellerId}/{productId}.jpg`).
 * @param {string} sellerId
 * @param {string} productId
 * @param {Blob} jpegBlob
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<string>} download URL
 */
export async function uploadProductImageJpeg(sellerId, productId, jpegBlob, onProgress) {
  const sid = String(sellerId ?? '').trim();
  const pid = String(productId ?? '').trim();
  if (!sid || !pid) {
    throw new Error('Missing seller or product.');
  }
  const r = ref(storage, PRODUCT_IMAGE_PATH(sid, pid));
  const task = uploadBytesResumable(r, jpegBlob, { contentType: 'image/jpeg' });
  return trackTask(task, onProgress);
}

export const COMBO_IMAGE_PATH = (sellerId, comboId) => `combos/${sellerId}/${comboId}.jpg`;

export async function uploadComboImageJpeg(sellerId, comboId, jpegBlob, onProgress) {
  const sid = String(sellerId ?? '').trim();
  const cid = String(comboId ?? '').trim();
  if (!sid || !cid) {
    throw new Error('Missing seller or combo.');
  }
  const r = ref(storage, COMBO_IMAGE_PATH(sid, cid));
  const task = uploadBytesResumable(r, jpegBlob, { contentType: 'image/jpeg' });
  return trackTask(task, onProgress);
}

export const UPI_QR_STORAGE_PATH = (sellerId) => `shops/${sellerId}/upi-qr.jpg`;
export const PUBLIC_SHOP_QR_PATH = (sellerId) => `shops/${sellerId}/public-shop-qr.png`;

export async function uploadUpiQrJpeg(sellerId, jpegBlob, onProgress) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    throw new Error('Missing seller.');
  }
  const r = ref(storage, UPI_QR_STORAGE_PATH(sid));
  const task = uploadBytesResumable(r, jpegBlob, { contentType: 'image/jpeg' });
  return trackTask(task, onProgress);
}

/**
 * Public catalog shop-link QR (PNG) — not the UPI image.
 * @param {string} sellerId
 * @param {Blob} pngBlob
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<string>} download URL
 */
export async function uploadPublicShopQrPng(sellerId, pngBlob, onProgress) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    throw new Error('Missing seller.');
  }
  const r = ref(storage, PUBLIC_SHOP_QR_PATH(sid));
  const task = uploadBytesResumable(r, pngBlob, { contentType: 'image/png' });
  return trackTask(task, onProgress);
}
