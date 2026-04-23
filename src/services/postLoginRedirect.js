import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getSellerByPhone, getUserDocument } from './firestore';

export const ROUTES = {
  dashboard: '/dashboard',
  onboarding: '/onboarding',
  login: '/login',
};

function isGoogleUser(user) {
  return Boolean(
    user?.providerData?.some((p) => p?.providerId === 'google.com'),
  );
}

async function loadSellerIfBlocked(sellerId) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) return null;
  const snap = await getDoc(doc(db, 'sellers', sid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * After sign-in: route by seller record. Blocks login when `isBlocked`.
 * Phone → `sellers` by phone. Google / other → `users/{uid}.sellerId` then `sellers`.
 */
export async function resolvePostLoginPath(user) {
  if (!user) {
    return ROUTES.onboarding;
  }

  if (user.isAnonymous) {
    return ROUTES.dashboard;
  }

  const phone = typeof user.phoneNumber === 'string' ? user.phoneNumber.trim() : '';

  if (phone) {
    const seller = await getSellerByPhone(phone);
    if (seller?.isBlocked === true) {
      await signOut(auth);
      return `${ROUTES.login}?blocked=1`;
    }
    return seller ? ROUTES.dashboard : ROUTES.onboarding;
  }

  if (isGoogleUser(user)) {
    const row = await getUserDocument(user.uid);
    const sellerId = row?.sellerId ? String(row.sellerId).trim() : '';
    if (sellerId) {
      const seller = await loadSellerIfBlocked(sellerId);
      if (seller?.isBlocked === true) {
        await signOut(auth);
        return `${ROUTES.login}?blocked=1`;
      }
      return ROUTES.dashboard;
    }
    return ROUTES.onboarding;
  }

  const row = await getUserDocument(user.uid);
  const sellerId = row?.sellerId ? String(row.sellerId).trim() : '';
  if (sellerId) {
    const seller = await loadSellerIfBlocked(sellerId);
    if (seller?.isBlocked === true) {
      await signOut(auth);
      return `${ROUTES.login}?blocked=1`;
    }
    return ROUTES.dashboard;
  }

  return ROUTES.onboarding;
}
