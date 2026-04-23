import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  GeoPoint,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  DEMO_COMBOS,
  DEMO_ORDERS,
  DEMO_PRODUCTS,
  DEMO_SELLER,
  isDemoSellerId,
} from '../constants/demoMode';
import { readPersistedSellerId } from '../constants/session';
import { db } from '../firebase';
import { normalizeShopCode } from '../utils/shopCode';
import {
  isLegacyBuyerStorefrontUrl,
  publicShopByCodeUrl,
  publicShopQrTargetUrl,
} from '../utils/publicShopUrl';
import { buildPublicShopQrPngBlob } from '../utils/shopQr';
import { uploadPublicShopQrPng } from './storage';

export { normalizeShopCode };

/** First two A–Z letters from shop name (skip non-letters). */
export function shopCodePrefixFromShopName(shopName) {
  const letters = String(shopName ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (letters.length >= 2) return letters.slice(0, 2);
  if (letters.length === 1) return `${letters}X`;
  return '';
}

function randomFourDigits() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Preferred: 2 letters + 4 digits (6 chars). */
function buildShopCodeFromShopName(shopName) {
  const prefix = shopCodePrefixFromShopName(shopName);
  if (!prefix) return null;
  const code = `${prefix}${randomFourDigits()}`;
  const n = code.length;
  if (n >= 6 && n <= 10) return code;
  return null;
}

/** Fallback when shop name has no letters: SHOP + 4 digits. */
function buildShopCodeFallback() {
  return `SHOP${randomFourDigits()}`;
}

async function isShopCodeTaken(normalizedCode) {
  const code = normalizeShopCode(normalizedCode);
  if (!code) return true;
  const qShop = query(
    collection(db, 'sellers'),
    where('shopCode', '==', code),
    limit(1),
  );
  const qLegacy = query(
    collection(db, 'sellers'),
    where('code', '==', code),
    limit(1),
  );
  const [snapShop, snapLegacy] = await Promise.all([getDocs(qShop), getDocs(qLegacy)]);
  return !snapShop.empty || !snapLegacy.empty;
}

/**
 * Allocate a unique `shopCode` (6–10 chars, uppercase). Tries shop-name–based codes first, then SHOP####.
 */
export async function allocateUniqueShopCode(shopName) {
  const maxAttempts = 28;
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate =
      i < 22
        ? buildShopCodeFromShopName(shopName) || buildShopCodeFallback()
        : buildShopCodeFallback();
    const normalized = normalizeShopCode(candidate);
    if (normalized.length < 6 || normalized.length > 10) {
      // eslint-disable-next-line no-continue
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const taken = await isShopCodeTaken(normalized);
    if (!taken) {
      return normalized;
    }
  }
  for (let j = 0; j < 40; j += 1) {
    const emergency = normalizeShopCode(`SHOP${randomFourDigits()}${j % 10}`);
    // eslint-disable-next-line no-await-in-loop
    if (!(await isShopCodeTaken(emergency))) {
      return emergency;
    }
  }
  throw new Error('Could not allocate a unique shop code. Try again.');
}

const PUBLIC_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Public shop code: "FA" + 6 alphanum (8 chars, e.g. FAXY12Z4) for share / QR.
 */
export async function allocateUniquePublicShopCode() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let suffix = '';
    for (let i = 0; i < 6; i += 1) {
      suffix += PUBLIC_CODE_ALPHABET[Math.floor(Math.random() * PUBLIC_CODE_ALPHABET.length)];
    }
    const candidate = `FA${suffix}`;
    // eslint-disable-next-line no-await-in-loop
    if (!(await isShopCodeTaken(candidate))) {
      return candidate;
    }
  }
  throw new Error('Could not allocate a public shop code. Try again.');
}

/**
 * @param {string} shopName
 * @returns {string}
 */
export function slugifyShopName(shopName) {
  return String(shopName ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''\u2018\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 64) || 'shop';
}

async function isShopSlugTaken(rawSlug) {
  const s = String(rawSlug ?? '')
    .trim()
    .toLowerCase();
  if (!s) return true;
  const q1 = query(collection(db, 'sellers'), where('shopSlug', '==', s), limit(1));
  const snap = await getDocs(q1);
  return !snap.empty;
}

/**
 * Unique `shopSlug` for `/s/slug` URLs.
 * @param {string} shopName
 */
export async function allocateUniqueShopSlug(shopName) {
  const base0 = slugifyShopName(shopName);
  const base = base0.length < 2 ? 'shop' : base0;
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (candidate.length > 100) {
      // eslint-disable-next-line no-continue
      break;
    }
    // eslint-disable-next-line no-await-in-loop
    if (!(await isShopSlugTaken(candidate))) {
      return candidate;
    }
  }
  const r = String(Math.random()).replace(/\D/g, '').slice(-5) || '1';
  return `${base}-x${r}`;
}

/**
 * If `sellers/{id}` has no usable shopCode, assign one (and legacy `code` alias) using shop name from doc or hint.
 * Safe to call on every login; no-ops when shopCode already set.
 */
export async function ensureSellerShopCodeFields(sellerId, hint = {}) {
  const sid = String(sellerId ?? '').trim();
  if (!sid || isDemoSellerId(sid)) {
    return null;
  }
  const ref = doc(db, 'sellers', sid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const existing = normalizeShopCode(data.shopCode ?? data.code ?? '');
  if (existing) {
    if (normalizeShopCode(data.shopCode ?? '') !== existing) {
      await updateDoc(ref, {
        shopCode: existing,
        code: existing,
        updatedAt: serverTimestamp(),
      });
    } else if (normalizeShopCode(data.code ?? '') !== existing) {
      await updateDoc(ref, { code: existing, updatedAt: serverTimestamp() });
    }
    return existing;
  }
  const code = await allocateUniquePublicShopCode();
  await updateDoc(ref, {
    shopCode: code,
    code,
    updatedAt: serverTimestamp(),
  });
  return code;
}

/**
 * Find a seller document by phone (E.164). Checks `phone` then `phoneNumber`.
 */
export async function getSellerByPhone(phone) {
  const normalized = typeof phone === 'string' ? phone.trim() : '';
  if (!normalized) {
    return null;
  }

  const byPhone = query(
    collection(db, 'sellers'),
    where('phone', '==', normalized),
    limit(1),
  );
  const snap = await getDocs(byPhone);
  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  }

  const byAlt = query(
    collection(db, 'sellers'),
    where('phoneNumber', '==', normalized),
    limit(1),
  );
  const snapAlt = await getDocs(byAlt);
  if (!snapAlt.empty) {
    const d = snapAlt.docs[0];
    return { id: d.id, ...d.data() };
  }

  return null;
}

/**
 * Seller for the signed-in account.
 *
 * **Phone users:** Resolve via `sellers` where `phone` / `phoneNumber` matches
 * `authUser.phoneNumber` — this ID is what `orders.sellerId` and products use (not Auth uid).
 *
 * **Fallback:** `users/{uid}.sellerId` → `sellers/{id}` (e.g. anonymous shop-code login).
 */
export async function getSellerForCurrentUser(uid, authUser) {
  const phone =
    typeof authUser?.phoneNumber === 'string' ? authUser.phoneNumber.trim() : '';
  const isPhoneUser = Boolean(phone) && !authUser?.isAnonymous;

  if (isPhoneUser) {
    const byPhone = await getSellerByPhone(phone);
    if (byPhone) {
      return byPhone;
    }
  }

  const userSnap = await getDoc(doc(db, 'users', uid));
  const sellerId = userSnap.exists() ? userSnap.data()?.sellerId : null;
  if (sellerId) {
    const sSnap = await getDoc(doc(db, 'sellers', sellerId));
    if (sSnap.exists()) {
      return { id: sSnap.id, ...sSnap.data() };
    }
  }

  if (authUser?.isAnonymous) {
    const sid = readPersistedSellerId();
    if (sid) {
      const sSnap = await getDoc(doc(db, 'sellers', sid));
      if (sSnap.exists()) {
        return { id: sSnap.id, ...sSnap.data() };
      }
    }
  }

  return null;
}

export async function getSellerByShopCode(raw) {
  const code = normalizeShopCode(raw);
  if (!code) {
    throw new Error('Enter your shop code');
  }

  const qShop = query(
    collection(db, 'sellers'),
    where('shopCode', '==', code),
    limit(1),
  );
  const snapShop = await getDocs(qShop);
  if (!snapShop.empty) {
    const d = snapShop.docs[0];
    return { id: d.id, ...d.data() };
  }

  const qLegacy = query(
    collection(db, 'sellers'),
    where('code', '==', code),
    limit(1),
  );
  const snapLegacy = await getDocs(qLegacy);
  if (!snapLegacy.empty) {
    const d = snapLegacy.docs[0];
    return { id: d.id, ...d.data() };
  }

  const byId = await getDoc(doc(db, 'sellers', code));
  if (byId.exists()) {
    return { id: byId.id, ...byId.data() };
  }

  return null;
}

/**
 * @param {string} raw
 * @returns {Promise<null | { id: string } & object>}
 */
export async function getSellerBySlug(raw) {
  const slug = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!slug) {
    return null;
  }
  const q1 = query(collection(db, 'sellers'), where('shopSlug', '==', slug), limit(1));
  const snap = await getDocs(q1);
  if (snap.empty) {
    return null;
  }
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

const ensurePublicInFlight = new Set();

/**
 * Backfill `shopSlug`, public URLs, and `qrUrl` (Storage PNG) for legacy docs; idempotent.
 * @param {string} sellerId
 */
export async function ensureSellerPublicAccess(sellerId) {
  const sid = String(sellerId ?? '').trim();
  if (!sid || isDemoSellerId(sid)) {
    return;
  }
  if (ensurePublicInFlight.has(sid)) {
    return;
  }
  ensurePublicInFlight.add(sid);
  try {
    const ref = doc(db, 'sellers', sid);
    let snap = await getDoc(ref);
    if (!snap.exists()) {
      return;
    }
    let d = snap.data();
    const code = normalizeShopCode(d.shopCode ?? d.code ?? '');
    if (!code) {
      return;
    }
    const byCode = publicShopByCodeUrl(code);
    const initialUrl = d.publicShopUrl || d.shopUrl;
    const legacyHost =
      isLegacyBuyerStorefrontUrl(d.publicShopUrl) || isLegacyBuyerStorefrontUrl(d.shopUrl);
    const publicUrlChanged =
      String(initialUrl ?? '').trim() !== byCode || legacyHost;
    let shopSlug = typeof d.shopSlug === 'string' && d.shopSlug.trim()
      ? d.shopSlug.trim().toLowerCase()
      : '';
    if (!shopSlug) {
      shopSlug = await allocateUniqueShopSlug(d.shopName || 'shop');
    }

    const hoursBackfill = {};
    if (d.openTime == null && d.openingTime) {
      hoursBackfill.openTime = d.openingTime;
    }
    if (d.closeTime == null && d.closingTime) {
      hoursBackfill.closeTime = d.closingTime;
    }

    const needMetaPatch =
      d.shopSlug !== shopSlug ||
      d.publicShopUrl !== byCode ||
      d.shopUrl !== byCode ||
      Object.keys(hoursBackfill).length > 0;
    if (needMetaPatch) {
      await updateDoc(ref, {
        ...hoursBackfill,
        shopSlug,
        shopUrl: byCode,
        publicShopUrl: byCode,
        updatedAt: serverTimestamp(),
      });
      const again = await getDoc(ref);
      d = again.data() ?? d;
    }

    const openQr = publicShopQrTargetUrl(code);
    const hasStoredQr = typeof d.qrUrl === 'string' && d.qrUrl.startsWith('http');
    if (hasStoredQr && !publicUrlChanged) {
      return;
    }
    if (!openQr) {
      return;
    }
    const blob = await buildPublicShopQrPngBlob(openQr);
    const downloadUrl = await uploadPublicShopQrPng(sid, blob);
    await updateDoc(ref, {
      qrUrl: downloadUrl,
      shopUrl: byCode,
      publicShopUrl: byCode,
      shopSlug,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[ensureSellerPublicAccess]', e);
    }
  } finally {
    ensurePublicInFlight.delete(sid);
  }
}

/**
 * @param {{ sellerId: string, source?: string, device?: string, [k: string]: unknown }} row
 */
export async function logShopVisit(row) {
  const sid = String(row?.sellerId ?? '').trim();
  if (!sid || isDemoSellerId(sid)) {
    return;
  }
  try {
    await addDoc(collection(db, 'shopVisits'), {
      sellerId: sid,
      source: String(row?.source ?? 'link').slice(0, 32) || 'link',
      time: serverTimestamp(),
      device: String(row?.device ?? 'unknown').slice(0, 512),
      path: row?.path != null ? String(row.path).slice(0, 512) : null,
    });
  } catch (e) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[logShopVisit]', e);
    }
  }
}

/**
 * Phone OTP (India): `users/{uid}` with buyer role and timestamps.
 * New doc: full profile. Existing doc: only `updatedAt` + `lastLoginAt` (preserves sellerId, shopCode, etc.).
 */
export async function upsertIndiaPhoneAuthUser(uid, phoneE164, options = {}) {
  const phone = String(phoneE164 ?? '').trim();
  const sellerId = options.sellerId != null ? String(options.sellerId).trim() : null;
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    await updateDoc(ref, {
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      role: 'seller',
    });
    return ref;
  }

  const payload = {
    uid,
    phone,
    country: 'IN',
    role: 'seller',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };
  if (sellerId) {
    payload.sellerId = sellerId;
  }
  await setDoc(ref, payload);
  return ref;
}

/**
 * Read `users/{uid}` (seller / buyer bridge doc).
 */
export async function getUserDocument(uid) {
  const id = String(uid ?? '').trim();
  if (!id) return null;
  const snap = await getDoc(doc(db, 'users', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Upsert `users/{uid}` for seller accounts after phone OTP or shop-code login.
 * Uses merge so partial updates do not wipe other fields.
 */
export async function upsertSellerUser(
  uid,
  {
    phone,
    role = 'seller',
    shopCode = null,
    sellerId = null,
    email = undefined,
    displayName = undefined,
    photoURL = undefined,
    authProvider = undefined,
    authType = undefined,
  } = {},
) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const payload = {
    role,
    updatedAt: serverTimestamp(),
  };
  if (phone !== undefined) {
    payload.phone = phone ?? null;
  }
  if (shopCode != null) {
    payload.shopCode = shopCode;
  }
  if (sellerId != null) {
    payload.sellerId = sellerId;
  }
  if (email !== undefined) {
    payload.email = email ?? null;
  }
  if (displayName !== undefined) {
    payload.displayName = displayName ?? null;
  }
  if (photoURL !== undefined) {
    payload.photoURL = photoURL ?? null;
  }
  if (authProvider !== undefined) {
    payload.authProvider = authProvider ?? null;
  }
  if (authType !== undefined) {
    payload.authType = authType ?? null;
  }
  if (!snap.exists()) {
    payload.createdAt = serverTimestamp();
  }
  await setDoc(ref, payload, { merge: true });
  return ref;
}

const TRIAL_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * Create a new seller in `sellers` and link `users/{uid}` to it.
 */
export async function createSellerProfile(uid, fields) {
  const phone = String(fields.phone ?? '').trim();
  const shopName = String(fields.shopName ?? '').trim();
  const ownerName = String(fields.ownerName ?? '').trim();
  const lat = Number(fields.lat);
  const lng = Number(fields.lng);
  const addressRaw = fields.address;
  const address =
    typeof addressRaw === 'string' && addressRaw.trim()
      ? addressRaw.trim()
      : null;

  if (!phone || !shopName || !ownerName) {
    throw new Error('Phone, shop name, and owner name are required.');
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Pick a location on the map.');
  }

  const now = new Date();
  const trialEndDate = new Date(now.getTime() + TRIAL_MS);

  const shopLoginPassword = String(fields.shopLoginPassword ?? '').trim();
  if (!shopLoginPassword || shopLoginPassword.length < 6) {
    throw new Error('Choose a shop login password (at least 6 characters).');
  }

  let shopCode = normalizeShopCode(fields.shopCode ?? '');
  if (!shopCode) {
    shopCode = await allocateUniquePublicShopCode();
  } else {
    const taken = await isShopCodeTaken(shopCode);
    if (taken) {
      throw new Error('That shop code is already taken. Leave it blank to auto-generate.');
    }
  }

  const shopSlug = await allocateUniqueShopSlug(shopName);
  const publicUrl = publicShopByCodeUrl(shopCode);

  const email =
    typeof fields.email === 'string' && fields.email.trim() ? fields.email.trim() : null;

  const sellerRef = await addDoc(collection(db, 'sellers'), {
    phone,
    email,
    shopName,
    ownerName,
    shopCode,
    code: shopCode,
    shopSlug,
    shopUrl: publicUrl,
    publicShopUrl: publicUrl,
    qrUrl: null,
    password: shopLoginPassword,
    location: new GeoPoint(lat, lng),
    address,
    slots: 0,
    sellerMode: 'freeTrial',
    sellerBillingState: 'trial',
    hasLiveHistory: false,
    deliveryEnabled: false,
    trialStart: Timestamp.fromDate(now),
    trialEnd: Timestamp.fromDate(trialEndDate),
    isLive: false,
    isBlocked: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await upsertSellerUser(uid, {
    phone,
    role: 'seller',
    sellerId: sellerRef.id,
    shopCode,
  });

  return sellerRef.id;
}

/**
 * Patch fields on `sellers/{sellerId}`. Omit keys you do not want to change.
 * For `location`, pass `lat` and `lng` numbers (stored as GeoPoint).
 */
export async function updateSellerDocument(sellerId, fields) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    throw new Error('Missing seller.');
  }
  if (isDemoSellerId(sid)) {
    throw new Error('Demo mode is read-only. Sign in to save settings.');
  }
  const ref = doc(db, 'sellers', sid);
  const payload = { updatedAt: serverTimestamp() };

  if (fields.shopName != null) {
    payload.shopName = String(fields.shopName).trim();
  }
  if (fields.ownerName != null) {
    payload.ownerName = String(fields.ownerName).trim();
  }
  if (fields.phone != null) {
    payload.phone = String(fields.phone).trim();
  }
  if (fields.address !== undefined) {
    const a = fields.address;
    payload.address = typeof a === 'string' && a.trim() ? a.trim() : null;
  }
  if (fields.lat != null && fields.lng != null) {
    const lt = Number(fields.lat);
    const lg = Number(fields.lng);
    if (Number.isFinite(lt) && Number.isFinite(lg)) {
      payload.location = new GeoPoint(lt, lg);
    }
  }
  if (fields.shopCode != null) {
    payload.shopCode = normalizeShopCode(fields.shopCode);
  }
  if (fields.description !== undefined) {
    const d = fields.description;
    payload.description =
      typeof d === 'string' && d.trim() ? d.trim() : d == null ? null : String(d);
  }
  if (fields.cuisineTags !== undefined) {
    const t = fields.cuisineTags;
    if (Array.isArray(t)) {
      payload.cuisineTags = t.map((x) => String(x).trim()).filter(Boolean);
    } else if (typeof t === 'string') {
      payload.cuisineTags = t
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      payload.cuisineTags = [];
    }
  }
  if (fields.openingTime !== undefined) {
    payload.openingTime =
      typeof fields.openingTime === 'string' ? fields.openingTime.trim() || null : null;
  }
  if (fields.closingTime !== undefined) {
    payload.closingTime =
      typeof fields.closingTime === 'string' ? fields.closingTime.trim() || null : null;
  }
  if (fields.deliveryEnabled !== undefined) {
    payload.deliveryEnabled = Boolean(fields.deliveryEnabled);
  }
  if (fields.deliveryRules !== undefined) {
    const r = fields.deliveryRules;
    payload.deliveryRules =
      typeof r === 'string' && r.trim() ? r.trim() : r == null ? null : String(r);
  }
  if (fields.upiId !== undefined) {
    payload.upiId =
      typeof fields.upiId === 'string' ? fields.upiId.trim() || null : null;
  }
  if (fields.upiPhone !== undefined) {
    payload.upiPhone =
      typeof fields.upiPhone === 'string' ? fields.upiPhone.trim() || null : null;
  }
  if (fields.qrImage !== undefined) {
    payload.qrImage =
      typeof fields.qrImage === 'string' ? fields.qrImage.trim() || null : null;
  }
  if (fields.upiName !== undefined) {
    payload.upiName =
      typeof fields.upiName === 'string' ? fields.upiName.trim() || null : null;
  }
  if (fields.globalDiscountText !== undefined) {
    const g = fields.globalDiscountText;
    payload.globalDiscountText =
      typeof g === 'string' && g.trim() ? g.trim() : g == null ? null : String(g);
  }
  if (fields.globalDiscountPercent !== undefined) {
    const n = Number(fields.globalDiscountPercent);
    payload.globalDiscountPercent = Number.isFinite(n) ? n : null;
  }
  if (fields.deliveryMinOrder !== undefined) {
    const n = Number(fields.deliveryMinOrder);
    payload.deliveryMinOrder = Number.isFinite(n) ? n : null;
  }
  if (fields.deliveryMaxDistanceKm !== undefined) {
    const n = Number(fields.deliveryMaxDistanceKm);
    payload.deliveryMaxDistanceKm = Number.isFinite(n) ? n : null;
  }
  if (fields.deliveryFreeAbove !== undefined) {
    const n = Number(fields.deliveryFreeAbove);
    payload.deliveryFreeAbove = Number.isFinite(n) ? n : null;
  }
  if (fields.orderReadyTemplate !== undefined) {
    payload.orderReadyTemplate =
      typeof fields.orderReadyTemplate === 'string'
        ? fields.orderReadyTemplate.trim() || null
        : null;
  }
  if (fields.messageTemplates !== undefined) {
    payload.messageTemplates =
      fields.messageTemplates && typeof fields.messageTemplates === 'object'
        ? fields.messageTemplates
        : null;
  }
  if (fields.imageUrl !== undefined) {
    const u = fields.imageUrl;
    payload.imageUrl =
      typeof u === 'string' && u.trim() ? u.trim() : u == null ? null : String(u);
  }
  if (fields.openTime !== undefined) {
    payload.openTime =
      typeof fields.openTime === 'string' ? fields.openTime.trim() || null : null;
  }
  if (fields.closeTime !== undefined) {
    payload.closeTime =
      typeof fields.closeTime === 'string' ? fields.closeTime.trim() || null : null;
  }
  if (fields.shopTags !== undefined) {
    const t = fields.shopTags;
    if (Array.isArray(t)) {
      payload.shopTags = t.map((x) => String(x).trim()).filter(Boolean);
    } else if (typeof t === 'string') {
      payload.shopTags = t
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      payload.shopTags = [];
    }
  }
  if (fields.tags !== undefined) {
    const t = fields.tags;
    if (Array.isArray(t)) {
      payload.tags = t.map((x) => String(x).trim()).filter(Boolean);
    } else if (typeof t === 'string') {
      payload.tags = t
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      payload.tags = [];
    }
  }
  if (fields.holidays !== undefined) {
    const h = fields.holidays;
    payload.holidays =
      typeof h === 'string' && h.trim() ? h.trim() : h == null ? null : String(h);
  }
  if (fields.menuLayouts !== undefined) {
    payload.menuLayouts =
      fields.menuLayouts && typeof fields.menuLayouts === 'object'
        ? fields.menuLayouts
        : null;
  }
  if (fields.shopOpenNow !== undefined) {
    payload.shopOpenNow = Boolean(fields.shopOpenNow);
  }
  if (fields.shopOpenManualMode !== undefined) {
    const m = String(fields.shopOpenManualMode ?? 'auto')
      .trim()
      .toLowerCase();
    if (m === 'open' || m === 'closed' || m === 'auto') {
      payload.shopOpenManualMode = m;
    }
  }
  if (fields.qrCodeUrl !== undefined) {
    const u = fields.qrCodeUrl;
    payload.qrCodeUrl =
      typeof u === 'string' && u.trim() ? u.trim() : u == null ? null : String(u);
  }
  if (fields.sellerMode !== undefined) {
    payload.sellerMode =
      typeof fields.sellerMode === 'string' ? fields.sellerMode.trim() || null : null;
  }
  if (fields.sellerBillingState !== undefined) {
    payload.sellerBillingState =
      typeof fields.sellerBillingState === 'string'
        ? fields.sellerBillingState.trim() || null
        : null;
  }
  if (fields.isLive !== undefined) {
    payload.isLive = Boolean(fields.isLive);
  }
  if (fields.hasLiveHistory !== undefined) {
    payload.hasLiveHistory = Boolean(fields.hasLiveHistory);
  }
  if (fields.approvedRechargeTotal !== undefined) {
    const n = Number(fields.approvedRechargeTotal);
    payload.approvedRechargeTotal = Number.isFinite(n) ? n : null;
  }
  if (fields.usageTotal !== undefined) {
    const n = Number(fields.usageTotal);
    payload.usageTotal = Number.isFinite(n) ? n : null;
  }
  if (fields.averageDailyUsage !== undefined) {
    const n = Number(fields.averageDailyUsage);
    payload.averageDailyUsage = Number.isFinite(n) ? n : null;
  }
  if (fields.balance !== undefined) {
    const n = Number(fields.balance);
    payload.balance = Number.isFinite(n) ? n : null;
  }
  if (fields.billingWarning !== undefined) {
    payload.billingWarning =
      typeof fields.billingWarning === 'string'
        ? fields.billingWarning.trim() || null
        : null;
  }

  await updateDoc(ref, payload);
}

/**
 * Reset trial window to now + 15 days (e.g. "Start 15 days Trial" action).
 */
export async function startSellerTrialPeriod(sellerId) {
  const now = new Date();
  const end = new Date(now.getTime() + TRIAL_MS);
  const ref = doc(db, 'sellers', sellerId);
  await updateDoc(ref, {
    trialStart: Timestamp.fromDate(now),
    trialEnd: Timestamp.fromDate(end),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Products for a seller (`products` where `sellerId` matches).
 */
export async function getProductsBySellerId(sellerId) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    return [];
  }

  const q = query(collection(db, 'products'), where('sellerId', '==', sid));
  const snapshot = await getDocs(q);
  const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) =>
    String(a.name ?? a.title ?? '').localeCompare(
      String(b.name ?? b.title ?? ''),
      undefined,
      { sensitivity: 'base' },
    ),
  );
  return rows;
}

const UNCATEGORIZED_CUISINE = 'Uncategorized';

/**
 * Real-time `products` for a seller (`where sellerId == sid`).
 * Calls `onData` with sorted rows on each update. Returns unsubscribe.
 */
export function subscribeProductsBySellerId(sellerId, onData, onError) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    onData([]);
    return () => {};
  }
  if (isDemoSellerId(sid)) {
    onData([...DEMO_PRODUCTS]);
    return () => {};
  }

  const q = query(collection(db, 'products'), where('sellerId', '==', sid));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) =>
        String(a.name ?? a.title ?? '').localeCompare(
          String(b.name ?? b.title ?? ''),
          undefined,
          { sensitivity: 'base' },
        ),
      );
      onData(rows);
    },
    onError,
  );
}

/**
 * Real-time `orders` for a seller, newest first.
 * Query: `sellerId == sid` and `orderBy('createdAt', 'desc')` — add the composite index if the Console prompts.
 */
/**
 * Real-time `users` collection (buyer profiles). Used for name/photo/address on Customers.
 */
export function subscribeUsersCollection(onData, onError) {
  return onSnapshot(
    collection(db, 'users'),
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(rows);
    },
    onError,
  );
}

/**
 * Load `orders/{orderId}` if it belongs to `sellerId`.
 */
export async function getOrderForSeller(orderId, sellerId) {
  const oid = String(orderId ?? '').trim();
  const sid = String(sellerId ?? '').trim();
  if (!oid || !sid) return null;
  if (isDemoSellerId(sid)) {
    const found = DEMO_ORDERS.find((o) => o.id === oid);
    return found ?? null;
  }
  const snap = await getDoc(doc(db, 'orders', oid));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.sellerId !== sid) return null;
  return { id: snap.id, ...data };
}

export function subscribeOrdersBySellerId(sellerId, onData, onError) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    onData([]);
    return () => {};
  }
  if (isDemoSellerId(sid)) {
    onData([...DEMO_ORDERS]);
    return () => {};
  }

  const q = query(
    collection(db, 'orders'),
    where('sellerId', '==', sid),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(rows);
    },
    onError,
  );
}

/**
 * Combos for a seller (`combos` where `sellerId` matches).
 */
export function subscribeCombosBySellerId(sellerId, onData, onError) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    onData([]);
    return () => {};
  }
  if (isDemoSellerId(sid)) {
    onData([...DEMO_COMBOS]);
    return () => {};
  }

  const q = query(collection(db, 'combos'), where('sellerId', '==', sid));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) =>
        String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
          sensitivity: 'base',
        }),
      );
      onData(rows);
    },
    onError,
  );
}

/**
 * Create a combo document.
 */
export async function createCombo(sellerId, fields) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    throw new Error('Missing seller.');
  }
  if (isDemoSellerId(sid)) {
    throw new Error('Demo mode is read-only.');
  }
  const name = String(fields.name ?? '').trim();
  const price = Number(fields.price);
  if (!name) {
    throw new Error('Combo name is required.');
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('Enter a valid combo price.');
  }
  const productIds = Array.isArray(fields.productIds)
    ? fields.productIds.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const imageUrl =
    typeof fields.imageUrl === 'string' && fields.imageUrl.trim()
      ? fields.imageUrl.trim()
      : null;

  let discountLabel;
  if (Object.prototype.hasOwnProperty.call(fields, 'discountLabel')) {
    const d = fields.discountLabel;
    discountLabel =
      typeof d === 'string' && d.trim() ? d.trim() : d == null || d === '' ? null : String(d);
  }
  let discountPercent;
  if (Object.prototype.hasOwnProperty.call(fields, 'discountPercent')) {
    const d = fields.discountPercent;
    if (d == null || d === '') {
      discountPercent = null;
    } else {
      const n = Number(d);
      discountPercent = Number.isFinite(n) && n >= 0 ? n : null;
    }
  }

  const ref = await addDoc(collection(db, 'combos'), {
    sellerId: sid,
    name,
    price,
    productIds,
    imageUrl,
    ...(discountLabel !== undefined ? { discountLabel } : {}),
    ...(discountPercent !== undefined ? { discountPercent } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Patch `combos/{comboId}` when it belongs to `sellerId`.
 */
export async function updateComboForSeller(comboId, sellerId, data) {
  const cid = String(comboId ?? '').trim();
  const sid = String(sellerId ?? '').trim();
  if (!cid || !sid) {
    throw new Error('Missing combo or seller.');
  }
  if (isDemoSellerId(sid)) {
    throw new Error('Demo mode is read-only.');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid update.');
  }
  const ref = doc(db, 'combos', cid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('Combo not found.');
  }
  if (snap.data().sellerId !== sid) {
    throw new Error('You cannot edit this combo.');
  }
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Walk-in / manual order — starts in `preparing`, `source: quick`.
 */
export async function createQuickOrder(sellerId, fields) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    throw new Error('Missing seller.');
  }
  if (isDemoSellerId(sid)) {
    throw new Error('Demo mode is read-only. Sign in to create orders.');
  }

  const buyerName = String(fields.buyerName ?? '').trim();
  const buyerPhone = String(fields.buyerPhone ?? '').trim();
  if (!buyerName) {
    throw new Error('Buyer name is required.');
  }
  if (!buyerPhone) {
    throw new Error('Buyer phone is required.');
  }

  const items = Array.isArray(fields.items) ? fields.items : [];
  const total = Number(fields.total);
  const paymentMode = fields.paymentMode === 'upi' ? 'upi' : 'cash';

  const buyerAddress =
    typeof fields.buyerAddress === 'string' && fields.buyerAddress.trim()
      ? fields.buyerAddress.trim()
      : null;

  await addDoc(collection(db, 'orders'), {
    sellerId: sid,
    source: 'quick',
    status: 'preparing',
    buyerName,
    buyerPhone,
    buyerAddress,
    items,
    total: Number.isFinite(total) ? total : 0,
    paymentMode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Patch `orders/{orderId}` after verifying `sellerId` matches.
 */
export async function patchOrder(orderId, sellerId, data) {
  const oid = String(orderId ?? '').trim();
  const sid = String(sellerId ?? '').trim();
  if (!oid || !sid) {
    throw new Error('Invalid order update.');
  }
  if (isDemoSellerId(sid)) {
    throw new Error('Demo mode is read-only.');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid patch data.');
  }

  const ref = doc(db, 'orders', oid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('Order not found.');
  }
  if (snap.data().sellerId !== sid) {
    throw new Error('You cannot update this order.');
  }

  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update `orders/{orderId}.status` after verifying `sellerId` matches.
 * Sets `updatedAt` with `serverTimestamp()` (preferred over `new Date()` in Firestore).
 */
export async function updateOrderStatus(orderId, sellerId, status) {
  const next = String(status ?? '').trim();
  if (!next) {
    throw new Error('Invalid status.');
  }
  await patchOrder(orderId, sellerId, { status: next });
}

export function getCuisineCategoryLabel(product) {
  const c = product?.cuisineCategory;
  if (typeof c === 'string' && c.trim()) {
    return c.trim();
  }
  return UNCATEGORIZED_CUISINE;
}

export { UNCATEGORIZED_CUISINE };

const CATEGORY_JOINER = ' › ';

/**
 * Split stored `category` (menu + item joined) back into form fields.
 */
export function parseStoredProductCategories(categoryStr) {
  if (typeof categoryStr !== 'string' || !categoryStr.trim()) {
    return { menuCategory: '', itemCategory: '' };
  }
  const s = categoryStr.trim();
  const idx = s.indexOf(CATEGORY_JOINER);
  if (idx === -1) {
    return { menuCategory: '', itemCategory: s };
  }
  return {
    menuCategory: s.slice(0, idx).trim(),
    itemCategory: s.slice(idx + CATEGORY_JOINER.length).trim(),
  };
}

function normalizeProductFieldsInput(fields) {
  const name = String(fields.name ?? '').trim();
  const priceRaw = fields.price;
  const price =
    typeof priceRaw === 'number' ? priceRaw : Number(priceRaw);
  const description = String(fields.description ?? '').trim() || null;
  const menuCat = String(fields.menuCategory ?? '').trim();
  const itemCat = String(fields.itemCategory ?? fields.category ?? '').trim();
  const categoryParts = [menuCat, itemCat].filter(Boolean);
  const category = categoryParts.length ? categoryParts.join(CATEGORY_JOINER) : null;
  const cuisineCategory = String(fields.cuisineCategory ?? '').trim() || null;
  const prepTime = String(fields.prepTime ?? '').trim() || null;
  const qty = Number(fields.quantity);
  const quantity = Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0;
  const tagList = Array.isArray(fields.tags)
    ? fields.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];

  let discountLabel;
  if (Object.prototype.hasOwnProperty.call(fields, 'discountLabel')) {
    const d = fields.discountLabel;
    discountLabel =
      typeof d === 'string' && d.trim() ? d.trim() : d == null || d === '' ? null : String(d);
  }
  let discountPercent;
  if (Object.prototype.hasOwnProperty.call(fields, 'discountPercent')) {
    const d = fields.discountPercent;
    if (d == null || d === '') {
      discountPercent = null;
    } else {
      const n = Number(d);
      discountPercent = Number.isFinite(n) && n >= 0 ? n : null;
    }
  }

  let imageUrl;
  if (Object.prototype.hasOwnProperty.call(fields, 'imageUrl')) {
    const u = fields.imageUrl;
    if (u == null || u === '') {
      imageUrl = null;
    } else {
      imageUrl = typeof u === 'string' && u.trim() ? u.trim() : String(u);
    }
  }

  let available = true;
  if (Object.prototype.hasOwnProperty.call(fields, 'available')) {
    available = Boolean(fields.available);
  }

  return {
    name,
    price,
    description,
    category,
    cuisineCategory,
    tags: tagList,
    prepTime,
    quantity,
    available,
    ...(discountLabel !== undefined ? { discountLabel } : {}),
    ...(discountPercent !== undefined ? { discountPercent } : {}),
    ...(imageUrl !== undefined ? { imageUrl } : {}),
  };
}

function validateProductNormalized(normalized) {
  if (!normalized.name) {
    throw new Error('Name is required.');
  }
  if (!Number.isFinite(normalized.price) || normalized.price < 0) {
    throw new Error('Enter a valid price.');
  }
}

/**
 * Create a product in `products` for the current seller.
 * Form fields menu + item categories are joined into `category` (e.g. "Breakfast › Snacks").
 */
export async function createProduct(sellerId, fields) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    throw new Error('Missing seller.');
  }
  if (isDemoSellerId(sid)) {
    throw new Error('Demo mode is read-only. Sign in to add items.');
  }

  const normalized = normalizeProductFieldsInput(fields);
  validateProductNormalized(normalized);

  const docPayload = {
    sellerId: sid,
    ...normalized,
    createdAt: serverTimestamp(),
  };
  docPayload.available = normalized.available;
  if (normalized.imageUrl != null) {
    docPayload.imageUrl = normalized.imageUrl;
  }
  if (normalized.discountLabel != null) {
    docPayload.discountLabel = normalized.discountLabel;
  }
  if (normalized.discountPercent != null) {
    docPayload.discountPercent = normalized.discountPercent;
  }
  const ref = await addDoc(collection(db, 'products'), docPayload);
  return ref.id;
}

/**
 * Load `products/{id}` if it exists and belongs to `sellerId`.
 */
export async function getProductForSeller(productId, sellerId) {
  const pid = String(productId ?? '').trim();
  const sid = String(sellerId ?? '').trim();
  if (!pid || !sid) {
    return null;
  }
  const ref = doc(db, 'products', pid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }
  const data = snap.data();
  if (data.sellerId !== sid) {
    return null;
  }
  return { id: snap.id, ...data };
}

/**
 * Update a product with `updateDoc` (ownership checked).
 */
export async function updateProduct(productId, sellerId, fields) {
  const pid = String(productId ?? '').trim();
  const sid = String(sellerId ?? '').trim();
  if (!pid || !sid) {
    throw new Error('Missing item or seller.');
  }
  if (isDemoSellerId(sid)) {
    throw new Error('Demo mode is read-only. Sign in to edit items.');
  }

  const ref = doc(db, 'products', pid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('Item not found.');
  }
  if (snap.data().sellerId !== sid) {
    throw new Error('You cannot edit this item.');
  }

  const normalized = normalizeProductFieldsInput(fields);
  validateProductNormalized(normalized);

  await updateDoc(ref, {
    ...normalized,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a product with `deleteDoc` (ownership checked).
 */
export async function deleteProduct(productId, sellerId) {
  const pid = String(productId ?? '').trim();
  const sid = String(sellerId ?? '').trim();
  if (!pid || !sid) {
    throw new Error('Missing item or seller.');
  }
  if (isDemoSellerId(sid)) {
    throw new Error('Demo mode is read-only.');
  }

  const ref = doc(db, 'products', pid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('Item not found.');
  }
  if (snap.data().sellerId !== sid) {
    throw new Error('You cannot delete this item.');
  }

  await deleteDoc(ref);
}

/**
 * Record a billing intent in `billing` (e.g. before UPI payment).
 */
export async function createBillingIntent({ sellerId, amount }) {
  const id = String(sellerId ?? '').trim();
  const amt = Number(amount);
  if (!id || !Number.isFinite(amt) || amt <= 0) {
    throw new Error('Select a valid package and try again.');
  }

  const ref = await addDoc(collection(db, 'billing'), {
    sellerId: id,
    amount: amt,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Example read — list recent documents from a collection (adjust name as needed).
 */
export async function listCollectionSample(collectionName, max = 20) {
  const q = query(collection(db, collectionName), limit(max));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const DEFAULT_SETTINGS_DOC_ID = 'global';

/**
 * Real-time `sellers/{sellerId}` document.
 */
export function subscribeSellerById(sellerId, onData, onError) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    onData(null);
    return () => {};
  }
  if (isDemoSellerId(sid)) {
    onData({ ...DEMO_SELLER });
    return () => {};
  }
  const ref = doc(db, 'sellers', sid);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData({ id: snap.id, ...snap.data() });
    },
    onError,
  );
}

/**
 * Admin defaults: `settings/{docId}` — slot rate, order fee %, trial days.
 */
export function subscribeGlobalAppSettings(onData, onError, docId = DEFAULT_SETTINGS_DOC_ID) {
  const ref = doc(db, 'settings', docId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData({
          slotRatePerDay: 2,
          orderFeePercent: 2,
          trialDays: 15,
        });
        return;
      }
      const d = snap.data();
      const slot = Number(d.slotRatePerDay ?? d.slotRate ?? 2);
      const pct = Number(d.orderFeePercent ?? d.orderPercent ?? 2);
      const trialDays = Number(d.trialDays ?? 15);
      onData({
        slotRatePerDay: Number.isFinite(slot) ? slot : 2,
        orderFeePercent: Number.isFinite(pct) ? pct : 2,
        trialDays: Number.isFinite(trialDays) ? trialDays : 15,
      });
    },
    onError,
  );
}

/**
 * Billing rows for a seller (newest first, capped client-side).
 */
export function subscribeBillingBySellerId(sellerId, onData, onError) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    onData([]);
    return () => {};
  }
  const q = query(collection(db, 'billing'), where('sellerId', '==', sid));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      onData(rows.slice(0, 200));
    },
    onError,
  );
}

function distinctMenuBucketsFromProducts(rows) {
  const set = new Set();
  for (const p of rows) {
    const { menuCategory } = parseStoredProductCategories(p.category);
    const m = String(menuCategory ?? '').trim();
    if (m) set.add(m);
  }
  return set.size;
}

function enabledMenuLayoutCount(menuLayouts) {
  if (!menuLayouts || typeof menuLayouts !== 'object') {
    return 0;
  }
  let n = 0;
  for (const v of Object.values(menuLayouts)) {
    if (v === true) n += 1;
  }
  return n;
}

/**
 * `slots` = active products + combos + enabled menu sections (or distinct menu names on products).
 */
export async function recomputeSellerSlotCount(sellerId) {
  const sid = String(sellerId ?? '').trim();
  if (!sid || isDemoSellerId(sid)) {
    return 0;
  }
  const sellerSnap = await getDoc(doc(db, 'sellers', sid));
  const seller = sellerSnap.exists() ? sellerSnap.data() : {};
  const productsQ = query(collection(db, 'products'), where('sellerId', '==', sid));
  const combosQ = query(collection(db, 'combos'), where('sellerId', '==', sid));
  const [pSnap, cSnap] = await Promise.all([getDocs(productsQ), getDocs(combosQ)]);
  const productRows = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const activeProducts = productRows.filter(
    (p) => p.available !== false && p.available !== 0,
  ).length;
  const comboCount = cSnap.size;
  let menuCount = enabledMenuLayoutCount(seller.menuLayouts);
  if (menuCount === 0) {
    menuCount = distinctMenuBucketsFromProducts(productRows);
  }
  const total = activeProducts + comboCount + menuCount;
  await updateDoc(doc(db, 'sellers', sid), {
    slots: total,
    updatedAt: serverTimestamp(),
  });
  return total;
}

/**
 * Compare shop login password to `sellers.password` (plain; set by admin / onboarding if you add it).
 */
export function sellerPasswordMatches(seller, password) {
  const expected = seller?.password;
  if (typeof expected !== 'string' || !expected) {
    return false;
  }
  return String(password ?? '') === expected;
}

/**
 * Change `sellers.password` for shop-code login. If no password exists yet, current check is skipped.
 */
export async function changeSellerShopLoginPassword(
  sellerId,
  { currentPassword, newPassword },
) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    throw new Error('Missing seller.');
  }
  if (isDemoSellerId(sid)) {
    throw new Error('Demo mode is read-only.');
  }
  const ref = doc(db, 'sellers', sid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('Shop not found.');
  }
  const seller = { id: snap.id, ...snap.data() };
  const existingPwd = seller?.password;
  const hasPwd = typeof existingPwd === 'string' && existingPwd.length > 0;
  if (hasPwd && !sellerPasswordMatches(seller, currentPassword)) {
    throw new Error('Current password is incorrect.');
  }
  const nw = String(newPassword ?? '').trim();
  if (nw.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }
  await updateDoc(ref, { password: nw, updatedAt: serverTimestamp() });
}
