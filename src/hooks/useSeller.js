import { useEffect, useRef, useState } from 'react';
import { clearDemoExplorer, DEMO_SELLER, isDemoExplorer } from '../constants/demoMode';
import { readSellerCodeSessionLocal } from '../constants/shopCodeLocalSession';
import { persistSellerId } from '../constants/session';
import { useAuth } from './useAuth';
import {
  ensureSellerPublicAccess,
  ensureSellerShopCodeFields,
  ensureSellerUserLinked,
  getSellerForCurrentUser,
  subscribeSellerById,
  updateSellerDocument,
} from '../services/firestore';
import { resolveShopOpenNow } from '../services/sellerHelpers';

/**
 * `seller` document for the current session: Firebase user **or** shop-code local session.
 */
export function useSeller() {
  const { user, loading: authLoading } = useAuth();
  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const shopCodeBackfillInFlight = useRef(false);

  const shopCodeOnly = Boolean(
    !user && !authLoading && readSellerCodeSessionLocal()?.sellerId,
  );

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

    if (user) {
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
    }

    const sid = readSellerCodeSessionLocal()?.sellerId;
    if (sid) {
      let cancelled = false;
      setLoading(true);
      setError(null);
      const unsub = subscribeSellerById(
        sid,
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
      return () => {
        cancelled = true;
        unsub();
      };
    }

    setSeller(null);
    setError(null);
    setLoading(false);
    return undefined;
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

  useEffect(() => {
    if (!user || isDemoExplorer() || !seller?.id || shopCodeOnly) {
      return undefined;
    }
    ensureSellerUserLinked(user, seller).catch(() => {});
    return undefined;
  }, [user, seller, shopCodeOnly]);

  useEffect(() => {
    if (isDemoExplorer() || !seller?.id || shopCodeOnly) {
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
        await ensureSellerShopCodeFields(seller.id);
      } catch {
        shopCodeBackfillInFlight.current = false;
      }
    })();
    return undefined;
  }, [seller, shopCodeOnly]);

  useEffect(() => {
    if (isDemoExplorer() || !seller?.id || shopCodeOnly) {
      return undefined;
    }
    const id = window.setTimeout(() => {
      ensureSellerPublicAccess(seller.id).catch(() => {});
    }, 1600);
    return () => {
      window.clearTimeout(id);
    };
  }, [seller, shopCodeOnly]);

  useEffect(() => {
    if (!seller?.id || isDemoExplorer() || shopCodeOnly) return undefined;
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
  }, [seller, shopCodeOnly]);

  const reload = () => setVersion((v) => v + 1);

  const sellerId = seller?.id ?? null;

  return { seller, sellerId, loading, error, reload, shopCodeOnly };
}
