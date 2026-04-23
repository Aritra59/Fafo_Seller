import { useEffect } from 'react';

/**
 * Full-viewport modal shell — mobile-friendly, tap backdrop to close.
 */
export function AuthModal({ titleId = 'auth-modal-title', onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="auth-modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="auth-modal-backdrop"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="auth-modal-panel">{children}</div>
    </div>
  );
}
