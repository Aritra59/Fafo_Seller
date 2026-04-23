import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LocationMapPicker } from '../components/LocationMapPicker';
import { DEFAULT_MAP_CENTER } from '../constants/map.js';
import { useSimpleToast } from '../hooks/useSimpleToast';
import {
  createSellerProfile,
  getSellerByPhone,
  getUserDocument,
  updateSellerDocument,
} from '../services/firestore';
import {
  compressImageToJpegBlob,
  isAcceptedImageType,
  uploadShopLogoJpeg,
} from '../services/storage';

export function ShopOnboarding() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast, showToast } = useSimpleToast();
  const [checking, setChecking] = useState(true);

  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(DEFAULT_MAP_CENTER.lat);
  const [lng, setLng] = useState(DEFAULT_MAP_CENTER.lng);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [shopLoginPassword, setShopLoginPassword] = useState('');
  const [shopLoginPassword2, setShopLoginPassword2] = useState('');
  const [pendingLogo, setPendingLogo] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [logoUploadPct, setLogoUploadPct] = useState(0);
  const logoPreviewRevoke = useRef(null);

  useEffect(() => {
    return () => {
      if (logoPreviewRevoke.current) {
        URL.revokeObjectURL(logoPreviewRevoke.current);
      }
    };
  }, []);

  useEffect(() => {
    if (authLoading || !user) {
      return undefined;
    }
    if (user.isAnonymous) {
      navigate('/dashboard', { replace: true });
      return undefined;
    }
    const phone = user.phoneNumber;

    let cancelled = false;
    (async () => {
      try {
        if (phone) {
          const seller = await getSellerByPhone(phone);
          if (!cancelled && seller) {
            navigate('/dashboard', { replace: true });
            return;
          }
        } else {
          const row = await getUserDocument(user.uid);
          const sid = row?.sellerId ? String(row.sellerId).trim() : '';
          if (sid) {
            if (!cancelled) navigate('/dashboard', { replace: true });
            return;
          }
        }
      } catch (e) {
        console.error('[ShopOnboarding] seller check failed', e);
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, navigate]);

  function handleLocationChange(nextLat, nextLng) {
    setLat(nextLat);
    setLng(nextLng);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const authPhone =
      typeof user?.phoneNumber === 'string' && user.phoneNumber.trim()
        ? user.phoneNumber.trim()
        : '';
    const digits = phoneDigits.replace(/\D/g, '').slice(0, 10);
    const phoneE164 = authPhone || (digits.length === 10 ? `+91${digits}` : '');
    if (!phoneE164) {
      setError('Enter a valid 10 digit mobile number.');
      return;
    }
    const pwd = shopLoginPassword.trim();
    const pwd2 = shopLoginPassword2.trim();
    if (pwd.length < 6) {
      setError('Shop login password must be at least 6 characters.');
      return;
    }
    if (pwd !== pwd2) {
      setError('Shop login passwords do not match.');
      return;
    }
    setBusy(true);
    setLogoUploadPct(0);
    try {
      const sellerId = await createSellerProfile(user.uid, {
        phone: phoneE164,
        email: user.email ?? undefined,
        shopName,
        ownerName,
        lat,
        lng,
        address,
        shopLoginPassword: pwd,
      });
      if (pendingLogo) {
        const blob = await compressImageToJpegBlob(pendingLogo);
        const url = await uploadShopLogoJpeg(sellerId, blob, setLogoUploadPct);
        await updateSellerDocument(sellerId, { imageUrl: url });
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = err.message ?? 'Could not save your shop.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setBusy(false);
      setLogoUploadPct(0);
    }
  }

  function onLogoFile(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    if (!isAcceptedImageType(file)) {
      showToast('Use JPG, PNG, or WebP.', 'error');
      return;
    }
    if (logoPreviewRevoke.current) {
      URL.revokeObjectURL(logoPreviewRevoke.current);
    }
    const url = URL.createObjectURL(file);
    logoPreviewRevoke.current = url;
    setLogoPreviewUrl(url);
    setPendingLogo(file);
  }

  if (authLoading || checking) {
    return (
      <div className="card onboarding-shell">
        <p className="muted" style={{ margin: 0 }}>
          Loading…
        </p>
      </div>
    );
  }

  return (
    <form className="card stack onboarding-shell" onSubmit={handleSubmit}>
      <div>
        <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.35rem', letterSpacing: '-0.02em' }}>
          Set up your shop
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: '0.9375rem' }}>
          Tell us about your stall. Trial starts today for 15 days.
        </p>
      </div>

      {!user?.phoneNumber ? (
        <div>
          <label className="label" htmlFor="onb-phone">
            Mobile number
          </label>
          <div className="auth-phone-row" style={{ maxWidth: '100%' }}>
            <span className="auth-phone-prefix" aria-hidden="true">
              +91
            </span>
            <input
              id="onb-phone"
              className="input auth-input auth-phone-input"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="9876543210"
              value={phoneDigits}
              onChange={(ev) =>
                setPhoneDigits(String(ev.target.value ?? '').replace(/\D/g, '').slice(0, 10))
              }
              maxLength={10}
              required
            />
          </div>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem' }}>
            Google sign-in: we need your shop contact number for orders and WhatsApp.
          </p>
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor="shop-name">
          Shop name
        </label>
        <input
          id="shop-name"
          className="input"
          type="text"
          autoComplete="organization"
          required
          value={shopName}
          onChange={(ev) => setShopName(ev.target.value)}
          placeholder="e.g. FaFo Street Bites"
        />
      </div>

      <div>
        <span className="label">Shop logo (optional)</span>
        <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem' }}>
          JPG, PNG, or WebP — uploaded after your shop is created.
        </p>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="input"
          onChange={onLogoFile}
          disabled={busy}
        />
        {logoPreviewUrl ? (
          <img
            className="image-upload-preview"
            style={{ marginTop: '0.65rem' }}
            src={logoPreviewUrl}
            alt="Logo preview"
          />
        ) : null}
        {busy && pendingLogo ? (
          <div className="upload-progress" style={{ marginTop: '0.5rem' }} aria-hidden>
            <div
              className="upload-progress__bar"
              style={{ width: `${Math.max(logoUploadPct, 4)}%` }}
            />
          </div>
        ) : null}
      </div>

      <div>
        <label className="label" htmlFor="owner-name">
          Owner name
        </label>
        <input
          id="owner-name"
          className="input"
          type="text"
          autoComplete="name"
          required
          value={ownerName}
          onChange={(ev) => setOwnerName(ev.target.value)}
          placeholder="Your full name"
        />
      </div>

      <div>
        <span className="label">Location on map</span>
        <LocationMapPicker
          lat={lat}
          lng={lng}
          onChange={handleLocationChange}
          onAddressHint={(label) => setAddress(label)}
        />
      </div>

      <div>
        <label className="label" htmlFor="address">
          Address <span className="muted">(optional)</span>
        </label>
        <input
          id="address"
          className="input"
          type="text"
          autoComplete="street-address"
          value={address}
          onChange={(ev) => setAddress(ev.target.value)}
          placeholder="Add unit, floor, nearby landmark — search above can pre-fill"
        />
      </div>

      <div className="stack" style={{ gap: '0.65rem' }}>
        <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
          A unique <strong>shop code</strong> is created from your shop name (e.g. FA4821). Use the
          password below to sign in with shop code anytime.
        </p>
        <div>
          <label className="label" htmlFor="onb-shop-pw">
            Shop code login password
          </label>
          <input
            id="onb-shop-pw"
            className="input"
            type="password"
            autoComplete="new-password"
            value={shopLoginPassword}
            onChange={(ev) => setShopLoginPassword(ev.target.value)}
            placeholder="At least 6 characters"
            minLength={6}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="onb-shop-pw2">
            Confirm password
          </label>
          <input
            id="onb-shop-pw2"
            className="input"
            type="password"
            autoComplete="new-password"
            value={shopLoginPassword2}
            onChange={(ev) => setShopLoginPassword2(ev.target.value)}
            placeholder="Re-enter password"
            minLength={6}
            required
          />
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="stack" style={{ gap: '0.5rem' }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save and continue'}
        </button>
        <Link to="/" className="btn btn-ghost" style={{ textAlign: 'center' }}>
          Back to home
        </Link>
      </div>

      {toast ? (
        <div
          className={`app-toast${toast.variant === 'error' ? ' app-toast--error' : ''}`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}
    </form>
  );
}
