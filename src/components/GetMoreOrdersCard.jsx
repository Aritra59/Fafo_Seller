import { usePublicShopActionHandlers } from '../hooks/usePublicShopActionHandlers';

/**
 * @param {object} props
 * @param {object | null} props.seller
 * @param {boolean} [props.readOnly]
 */
export function GetMoreOrdersCard({ seller, readOnly = false }) {
  const { copyLink, downloadQr, printShopQr, shareNative } = usePublicShopActionHandlers(seller);

  if (!seller) {
    return null;
  }

  return (
    <section
      className="dashboard-get-orders card"
      aria-label="Get more orders"
      style={{ margin: '0 0 0.75rem' }}
    >
      <h2 className="dashboard-section-title" style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>
        Get more orders
      </h2>
      <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.85rem' }}>
        Share your public menu link or QR — customers do not need to sign in to browse.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
        <button type="button" className="btn btn-ghost" disabled={readOnly} onClick={copyLink}>
          Copy link
        </button>
        <button type="button" className="btn btn-ghost" disabled={readOnly} onClick={downloadQr}>
          Download QR
        </button>
        <button type="button" className="btn btn-ghost" disabled={readOnly} onClick={printShopQr}>
          Print QR
        </button>
        <button type="button" className="btn btn-primary" disabled={readOnly} onClick={shareNative}>
          Share
        </button>
      </div>
    </section>
  );
}
