import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const SellerPageTitleContext = createContext(null);

export function SellerPageTitleProvider({ children }) {
  const [suffix, setSuffixState] = useState(null);
  const setSuffix = useCallback((v) => {
    setSuffixState(v == null || v === '' ? null : String(v));
  }, []);
  const value = useMemo(() => ({ suffix, setSuffix }), [suffix, setSuffix]);
  return <SellerPageTitleContext.Provider value={value}>{children}</SellerPageTitleContext.Provider>;
}

export function useSellerPageTitle() {
  const ctx = useContext(SellerPageTitleContext);
  if (!ctx) {
    throw new Error('useSellerPageTitle must be used within SellerPageTitleProvider');
  }
  return ctx;
}

/** Registers a secondary label after the route title, e.g. `Menu · Items`. Clears on unmount. */
export function useRegisterPageTitleSuffix(suffix) {
  const { setSuffix } = useSellerPageTitle();
  useEffect(() => {
    setSuffix(suffix ?? null);
    return () => setSuffix(null);
  }, [suffix, setSuffix]);
}
