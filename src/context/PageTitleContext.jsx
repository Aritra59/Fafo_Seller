import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const PageTitleContext = createContext(
  /** @type {{ title: string; setTitle: (t: string) => void } | null} */ (null),
);

export function PageTitleProvider({ children }) {
  const [title, setTitle] = useState('');
  const value = useMemo(() => ({ title, setTitle }), [title]);
  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
}

/** Registers the current route title in the sticky header (clears on unmount). */
export function usePageTitle(title) {
  const ctx = useContext(PageTitleContext);
  useEffect(() => {
    if (!ctx) return undefined;
    ctx.setTitle(title);
    return () => {
      ctx.setTitle('');
    };
  }, [title, ctx]);
}

export function usePageTitleContext() {
  return useContext(PageTitleContext);
}
