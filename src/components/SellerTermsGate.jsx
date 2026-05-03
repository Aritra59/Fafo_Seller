import { useEffect, useState } from 'react';
import { isDemoExplorer } from '../constants/demoMode';
import { useSeller } from '../hooks/useSeller';
import {
  getSellerTermsDocument,
  resolveSellerTermsDisplayContent,
  updateSellerDocument,
} from '../services/firestore';

/**
 * Mandatory seller terms: when `seller.acceptedTermsVersion` &lt; `terms/seller`.version,
 * blocks interaction until the seller accepts (updates `acceptedTermsVersion`).
 */
export function SellerTermsGate({ children }) {
  const { seller, loading: sellerLoading, shopCodeOnly } = useSeller();
  const [termsDoc, setTermsDoc] = useState(null);
  const [termsLoad, setTermsLoad] = useState('idle');
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [acceptErr, setAcceptErr] = useState(null);

  useEffect(() => {
    if (!seller?.id || isDemoExplorer()) {
      setTermsDoc(null);
      setTermsLoad('idle');
      return undefined;
    }
    let cancelled = false;
    setTermsLoad('loading');
    (async () => {
      try {
        const t = await getSellerTermsDocument();
        if (!cancelled) {
          setTermsDoc(t ?? null);
          setTermsLoad('done');
        }
      } catch {
        if (!cancelled) {
          setTermsDoc(null);
          setTermsLoad('done');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seller?.id]);

  const requiredVersion =
    typeof termsDoc?.version === 'number'
      ? termsDoc.version
      : typeof termsDoc?.version === 'string'
        ? Number(termsDoc.version)
        : 0;

  const acceptedVersion =
    typeof seller?.acceptedTermsVersion === 'number'
      ? seller.acceptedTermsVersion
      : typeof seller?.acceptedTermsVersion === 'string'
        ? Number(seller.acceptedTermsVersion)
        : 0;

  const blocking =
    !isDemoExplorer() &&
    !shopCodeOnly &&
    seller?.id &&
    !sellerLoading &&
    termsLoad === 'done' &&
    Number.isFinite(requiredVersion) &&
    requiredVersion > 0 &&
    (!Number.isFinite(acceptedVersion) || acceptedVersion < requiredVersion);

  async function handleAccept() {
    if (!seller?.id || !blocking) return;
    setAcceptErr(null);
    setAcceptBusy(true);
    try {
      await updateSellerDocument(seller.id, { acceptedTermsVersion: requiredVersion });
    } catch (e) {
      setAcceptErr(e?.message ?? 'Could not save acceptance.');
    } finally {
      setAcceptBusy(false);
    }
  }

  const title =
    typeof termsDoc?.title === 'string' && termsDoc.title.trim()
      ? termsDoc.title.trim()
      : 'Seller terms';
  const rawBody = resolveSellerTermsDisplayContent(termsDoc);

  return (
    <div className="seller-terms-gate-wrap">
      <div
        className="seller-terms-gate-content"
        aria-hidden={blocking || undefined}
        inert={blocking ? true : undefined}
        style={blocking ? { pointerEvents: 'none', userSelect: 'none' } : undefined}
      >
        {children}
      </div>
      {blocking ? (
        <div
          className="seller-terms-gate-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="seller-terms-gate-heading"
          aria-describedby="seller-terms-gate-body"
        >
          <div className="seller-terms-gate-panel card stack">
            <h2 id="seller-terms-gate-heading" className="seller-terms-gate-heading" style={{ margin: 0 }}>
              {title}
            </h2>
            <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
              Version {requiredVersion}. You must accept to continue using the seller app.
            </p>
            <div id="seller-terms-gate-body" className="seller-terms-gate-scroll">
              {rawBody ? (
                <pre className="seller-terms-gate-pre">{rawBody}</pre>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Terms content is configured by your administrator (terms/seller in Firestore). Contact support
                  if this screen stays empty after an update.
                </p>
              )}
            </div>
            {acceptErr ? <p className="error">{acceptErr}</p> : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={acceptBusy || !seller?.id}
              onClick={() => void handleAccept()}
            >
              {acceptBusy ? 'Saving…' : 'Accept'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
