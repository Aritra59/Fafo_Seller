import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { persistSellerCodeSessionLocal } from '../../constants/shopCodeLocalSession';
import { getSellerByShopCode, normalizeShopCode } from '../../services/firestore';

export function ShopCodeAuth() {
  const navigate = useNavigate();
  const [shopCode, setShopCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const normalized = normalizeShopCode(shopCode);
    if (!normalized) {
      setError('Enter your shop code');
      return;
    }

    setBusy(true);
    try {
      const seller = await getSellerByShopCode(shopCode);
      if (!seller) {
        setError('Invalid shop code');
        return;
      }

      if (seller.isBlocked === true) {
        setError('This shop is blocked. Contact support.');
        return;
      }

      const phone =
        typeof seller.phone === 'string' && seller.phone.trim()
          ? seller.phone.trim()
          : typeof seller.phoneNumber === 'string' && seller.phoneNumber.trim()
            ? seller.phoneNumber.trim()
            : null;
      const ownerName =
        typeof seller.ownerName === 'string' && seller.ownerName.trim()
          ? seller.ownerName.trim()
          : null;
      const shopName =
        typeof seller.shopName === 'string' && seller.shopName.trim()
          ? seller.shopName.trim()
          : null;

      persistSellerCodeSessionLocal({
        sellerId: seller.id,
        shopCode: normalized,
        phone,
        ownerName,
        shopName,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message ?? 'Could not continue');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form stack" onSubmit={handleSubmit}>
      <p className="auth-lead muted" style={{ margin: 0 }}>
        Enter the shop code you received. You will open your business dashboard in this browser — no
        password required.
      </p>
      <div>
        <label className="label" htmlFor="shop-code">
          Shop code
        </label>
        <input
          id="shop-code"
          className="input auth-input"
          type="text"
          name="shopCode"
          autoComplete="username"
          autoCapitalize="characters"
          placeholder="e.g. FA4821"
          value={shopCode}
          onChange={(ev) => setShopCode(ev.target.value)}
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
        {busy ? 'Opening…' : 'Continue to dashboard'}
      </button>
    </form>
  );
}
