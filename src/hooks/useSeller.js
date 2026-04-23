import { useEffect, useRef, useState } from 'react';
import { clearDemoExplorer, DEMO_SELLER, isDemoExplorer } from '../constants/demoMode';
import { persistSellerId } from '../constants/session';
import { useAuth } from './useAuth';
import {
  ensureSellerPublicAccess,
  ensureSellerShopCodeFields,
  getSellerForCurrentUser,
  subscribeSellerById,
  updateSellerDocument,
} from '../services/firestore';
import { resolveShopOpenNow } from '../services/sellerHelpers';

/**
 * Real-time `sellers` document for the current user.
 * `sellerId` is the shop document id — use for orders/products queries, not `user.uid`.
 */
export function useSeller() {
  const { user, loading: authLoading } = useAuth();
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const shopCodeBackfillInFlight = useRef(false);

  useEffect(() => {
    if (isDemoExplorer()) {
      setSeller({ ...DEMO_SELLER });
      setError(null);
      setLoading(false);
      return undefined;
    }

    if (authLoading) {
      return undefined;
    }

    if (!user) {
      setSeller(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    let unsubSeller = () => {};

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const initial = await getSellerForCurrentUser(user.uid, user);
        if (cancelled) return;
        if (!initial?.id) {
          setSeller(null);
          setLoading(false);
          return;
        }

        unsubSeller = subscribeSellerById(
          initial.id,
          (row) => {
            if (!cancelled) {
              setSeller(row);
              setLoading(false);
            }
          },
          (e) => {
            if (!cancelled) {
              setError(e);
              setSeller(null);
              setLoading(false);
            }
          },
        );
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setSeller(null);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubSeller();
    };
  }, [user, authLoading, version]);

  useEffect(() => {
    if (user && isDemoExplorer()) {
      clearDemoExplorer();
      setVersion((v) => v + 1);
    }
  }, [user]);

  useEffect(() => {
    if (seller?.id) {
      persistSellerId(seller.id);
    }
  }, [seller?.id]);

  /** Backfill `shopCode` / `code` for legacy seller docs (silent). */
  useEffect(() => {
    if (isDemoExplorer() || !seller?.id) {
      return undefined;
    }
    const sc = String(seller.shopCode ?? seller.code ?? '').trim();
    if (sc) {
      shopCodeBackfillInFlight.current = false;
      return undefined;
    }
    if (shopCodeBackfillInFlight.current) {
      return undefined;
    }
    shopCodeBackfillInFlight.current = true;
    (async () => {
      try {
        await ensureSellerShopCodeFields(seller.id, seller);
      } catch {
        shopCodeBackfillInFlight.current = false;
      }
    })();
    return undefined;
  }, [seller?.id, seller?.shopCode, seller?.code, seller?.shopName]);

  /** Public menu URL, slug, and shop QR in Storage (silent; idempotent). */
  useEffect(() => {
    if (isDemoExplorer() || !seller?.id) {
      return undefined;
    }
    const id = window.setTimeout(() => {
      ensureSellerPublicAccess(seller.id).catch(() => {});
    }, 1600);
    return () => window.clearTimeout(id);
  }, [seller?.id]);

  /** Sync buyer-facing open/closed flag when hours change (no-op if unchanged). */
  useEffect(() => {
    if (!seller?.id || isDemoExplorer()) return undefined;
    const next = resolveShopOpenNow(seller);
    if (next === null) return undefined;
    if (seller.shopOpenNow === next) return undefined;
    const id = seller.id;
    const t = window.setTimeout(() => {
      updateSellerDocument(id, { shopOpenNow: next }).catch(() => {});
    }, 400);
    return () => {
      window.clearTimeout(t);
    };
  }, [
    seller?.id,
    seller?.openingTime,
    seller?.closingTime,
    seller?.openTime,
    seller?.closeTime,
    seller?.shopOpenManualMode,
    seller?.shopOpenMode,
    seller?.shopOpenNow,
  ]);

  const reload = () => setVersion((v) => v + 1);

  const sellerId = seller?.id ?? null;

  return { seller, sellerId, loading, error, reload };
}
