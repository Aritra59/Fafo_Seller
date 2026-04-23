import { useCallback, useEffect, useState } from 'react';

/**
 * Fixed bottom toast (success / error). Auto-dismiss ~4s.
 */
export function useSimpleToast() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((message, variant = 'success') => {
    setToast({ message, variant });
  }, []);

  return { toast, showToast };
}
