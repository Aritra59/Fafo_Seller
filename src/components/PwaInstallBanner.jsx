import { useCallback, useEffect, useState } from 'react';

/**
 * Suggest installing the seller dashboard (this PWA) on mobile. Safari uses manual “Add to Home”.
 */
export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState(/** @type {BeforeInstallPromptEvent | null} */ (null));
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('fafo_pwa_banner_dismiss') === '1',
  );

  useEffect(() => {
    function onBip(/** @type {Event} */ e) {
      e.preventDefault();
      setDeferred(/** @type {BeforeInstallPromptEvent} */ (e));
    }
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferred(null);
      }
    } catch {
      setDeferred(null);
    }
  }, [deferred]);

  if (dismissed) {
    return null;
  }
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return null;
  }

  const isIos =
    /iphone|ipad|ipod/i.test(String(navigator.userAgent || '')) &&
    !String(navigator.userAgent).includes('CriOS');
  const isSmall = window.matchMedia('(max-width: 720px)').matches;

  if (!isSmall && !deferred && !isIos) {
    return null;
  }

  return (
    <div
      className="pwa-install-banner card"
      style={{
        margin: '0 0 0.75rem',
        padding: '0.6rem 0.75rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.88rem',
      }}
      role="status"
    >
      <span style={{ flex: '1 1 10rem' }}>
        <strong>Install seller dashboard</strong> — add FaFo to your home screen for quick access.
        {isIos
          ? ' In Safari, tap Share → “Add to Home Screen”.'
          : null}
      </span>
      {deferred ? (
        <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={install}>
          Install
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost"
        style={{ fontSize: '0.8rem' }}
        onClick={() => {
          localStorage.setItem('fafo_pwa_banner_dismiss', '1');
          setDismissed(true);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

/** @typedef {{ prompt: () => Promise<void>, userChoice: Promise<{ outcome: string }> }} BeforeInstallPromptEvent */
