import { signInAnonymously } from 'firebase/auth';
import { useState } from 'react';
import { persistSellerId } from '../../constants/session';
import { persistShopCodeSession } from '../../constants/shopCodeSession';
import { auth } from '../../firebase';
import {
  getSellerByShopCode,
  normalizeShopCode,
  sellerPasswordMatches,
  upsertSellerUser,
} from '../../services/firestore';

export function ShopCodeAuth({ onSuccess }) {
  const [shopCode, setShopCode] = useState('');
  const [password, setPassword] = useState('');
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
    if (!String(password).trim()) {
      setError('Enter your shop password');
      return;
    }

    setBusy(true);
    try {
      const seller = await getSellerByShopCode(shopCode);
      if (!seller) {
        setError('Invalid shop code or password.');
        return;
      }

      if (seller.isBlocked === true) {
        setError('This shop is blocked. Contact support.');
        return;
      }

      if (!sellerPasswordMatches(seller, password)) {
        setError('Invalid shop code or password.');
        return;
      }

      const cred = await signInAnonymously(auth);
      const phone =
        typeof seller.phone === 'string' && seller.phone.trim()
          ? seller.phone.trim()
          : typeof seller.phoneNumber === 'string' && seller.phoneNumber.trim()
            ? seller.phoneNumber.trim()
            : null;
      await upsertSellerUser(cred.user.uid, {
        phone,
        role: 'seller',
        shopCode: normalized,
        sellerId: seller.id,
        authType: 'shopCode',
      });
      persistSellerId(seller.id);
      persistShopCodeSession({
        sellerId: seller.id,
        shopCode: normalized,
        phone,
      });
      onSuccess?.(cred.user);
    } catch (err) {
      setError(err.message ?? 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form stack" onSubmit={handleSubmit}>
      <p className="auth-lead muted" style={{ margin: 0 }}>
        Sign in with the shop code and password from your admin.
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
      <div>
        <label className="label" htmlFor="shop-password">
          Password
        </label>
        <input
          id="shop-password"
          className="input auth-input"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Shop password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Login with Shop Code'}
      </button>
    </form>
  );
}
