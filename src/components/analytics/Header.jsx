import { useNavigate } from 'react-router-dom';

/**
 * @param {object} props
 * @param {string} [props.shopName]
 * @param {string} [props.ownerName]
 * @param {string} [props.subtitle] — default "Food Forward • Seller AI Dashboard"
 */
export function AnalyticsHeader({ shopName, ownerName, subtitle = 'Food Forward • Seller AI Dashboard' }) {
  const navigate = useNavigate();
  const name = (ownerName && String(ownerName).trim()) || (shopName && String(shopName).trim()) || 'Seller';
  const initial = name.charAt(0).toUpperCase();

  return (
    <header className="analytics-top-header">
      <div className="analytics-top-header-row1">
        <button
          type="button"
          className="analytics-back"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          ‹
        </button>
        <div className="analytics-brand">
          <span className="analytics-brand-mark">Fa</span>
          <div>
            <div className="analytics-brand-name">FaFo Analytics</div>
            <p className="analytics-brand-sub muted" style={{ margin: 0, fontSize: '0.68rem' }}>
              {subtitle}
            </p>
          </div>
        </div>
        <div className="analytics-profile-blk">
          <div className="analytics-pill-avatar" aria-hidden>
            {initial}
          </div>
          <div className="analytics-profile-txt">
            <span className="analytics-profile-name">{name}</span>
            <span className="analytics-profile-role muted" style={{ fontSize: '0.68rem' }}>
              Owner view
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
