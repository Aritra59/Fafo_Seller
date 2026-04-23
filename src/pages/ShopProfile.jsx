import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeller } from '../hooks/useSeller';
import { useSimpleToast } from '../hooks/useSimpleToast';
import {
  startSellerTrialPeriod,
  updateSellerDocument,
} from '../services/firestore';
import {
  compressImageToJpegBlob,
  isAcceptedImageType,
  uploadShopLogoJpeg,
} from '../services/storage';
import {
  checkTrialStatus,
  getTrialDaysLeft,
  isTrialEndingSoon,
  resolveEffectiveSellerMode,
  TRIAL_ENDING_DAYS_THRESHOLD,
} from '../services/sellerHelpers';

function locationToCoords(location) {
  if (!location) {
    return { lat: '', lng: '' };
  }
  if (typeof location.latitude === 'number' && typeof location.longitude === 'number') {
    return { lat: location.latitude, lng: location.longitude };
  }
  return { lat: '', lng: '' };
}

function formatCoords(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '—';
  }
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function whatsappHref(phoneE164) {
  const digits = String(phoneE164 ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}`;
}

export function ShopProfile() {
  const { seller, loading, error, reload } = useSeller();
  const { toast, showToast } = useSimpleToast();
  const [editing, setEditing] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const [pendingLogo, setPendingLogo] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [logoUploadPct, setLogoUploadPct] = useState(0);
  const logoPreviewRevoke = useRef(null);

  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    return () => {
      if (logoPreviewRevoke.current) {
        URL.revokeObjectURL(logoPreviewRevoke.current);
        logoPreviewRevoke.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!seller || editing) return;
    setShopName(seller.shopName ?? '');
    setOwnerName(seller.ownerName ?? '');
    setPhone(seller.phone ?? '');
    setAddress(seller.address ?? '');
    const c = locationToCoords(seller.location);
    setLat(c.lat === '' ? '' : String(c.lat));
    setLng(c.lng === '' ? '' : String(c.lng));
  }, [seller, editing]);

  function clearLogoPick() {
    if (logoPreviewRevoke.current) {
      URL.revokeObjectURL(logoPreviewRevoke.current);
      logoPreviewRevoke.current = null;
    }
    setPendingLogo(null);
    setLogoPreviewUrl('');
    setLogoUploadPct(0);
  }

  function beginEdit() {
    if (!seller) return;
    setFormError('');
    clearLogoPick();
    const c = locationToCoords(seller.location);
    setShopName(seller.shopName ?? '');
    setOwnerName(seller.ownerName ?? '');
    setPhone(seller.phone ?? '');
    setAddress(seller.address ?? '');
    setLat(c.lat === '' ? '' : String(c.lat));
    setLng(c.lng === '' ? '' : String(c.lng));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setFormError('');
    clearLogoPick();
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

  async function handleSave(e) {
    e.preventDefault();
    if (!seller?.id) return;
    setFormError('');
    const lt = parseFloat(lat);
    const lg = parseFloat(lng);
    if (!Number.isFinite(lt) || !Number.isFinite(lg)) {
      setFormError('Enter valid latitude and longitude.');
      return;
    }
    setSaveBusy(true);
    setLogoUploadPct(0);
    try {
      const updates = {
        shopName,
        ownerName,
        phone,
        address,
        lat: lt,
        lng: lg,
      };
      if (pendingLogo) {
        const blob = await compressImageToJpegBlob(pendingLogo);
        const url = await uploadShopLogoJpeg(seller.id, blob, setLogoUploadPct);
        updates.imageUrl = url;
      }
      await updateSellerDocument(seller.id, updates);
      clearLogoPick();
      setEditing(false);
      reload();
      showToast('Profile saved.');
    } catch (err) {
      const msg = err.message ?? 'Could not save.';
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setSaveBusy(false);
      setLogoUploadPct(0);
    }
  }

  async function handleStartTrial() {
    if (!seller?.id || !termsAccepted) return;
    setTrialBusy(true);
    setFormError('');
    try {
      await startSellerTrialPeriod(seller.id);
      reload();
    } catch (err) {
      setFormError(err.message ?? 'Could not start trial.');
    } finally {
      setTrialBusy(false);
    }
  }

  function handleBuySlots() {
    if (!termsAccepted) return;
    window.alert('Slot purchase and Go Live will be available here.');
  }

  const supportWa =
    import.meta.env.VITE_SUPPORT_WHATSAPP || seller?.phone || '';
  const waUrl = whatsappHref(supportWa);

  const effective = seller ? resolveEffectiveSellerMode(seller) : 'demo';
  const isLiveAccount = effective === 'live';

  const trialStatus = seller ? checkTrialStatus(seller) : 'expired';
  const daysLeft = seller ? getTrialDaysLeft(seller.trialEnd) : 0;
  const trialActive = trialStatus === 'active';
  const endingSoon =
    seller && effective === 'freeTrial' ? isTrialEndingSoon(seller) : false;
  const blocked = seller?.isBlocked === true;

  const actionsLocked = !termsAccepted || blocked;

  if (loading) {
    return (
      <div className="shop-profile card">
        <p className="muted" style={{ margin: 0 }}>
          Loading profile…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shop-profile card stack">
        <p className="error" style={{ margin: 0 }}>
          {error.message ?? 'Could not load profile.'}
        </p>
        <Link to="/" className="btn btn-ghost">
          Home
        </Link>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="shop-profile card stack">
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>No shop profile</h1>
        <p className="muted" style={{ margin: 0 }}>
          Create your seller profile first.
        </p>
        <Link to="/onboarding" className="btn btn-primary">
          Set up shop
        </Link>
      </div>
    );
  }

  const coords = locationToCoords(seller.location);
  const displayCoords = formatCoords(coords.lat, coords.lng);

  return (
    <div className="shop-profile">
      <header className="shop-profile-header">
        <h1 style={{ margin: 0, fontSize: '1.35rem', letterSpacing: '-0.02em' }}>
          Shop profile
        </h1>
        {!editing ? (
          <button type="button" className="btn btn-ghost shop-profile-edit-btn" onClick={beginEdit}>
            Edit
          </button>
        ) : null}
      </header>

      {!editing ? (
        <div className="card stack shop-profile-card">
          {typeof seller.imageUrl === 'string' && seller.imageUrl.trim() ? (
            <div className="shop-profile-logo-wrap">
              <img
                className="shop-profile-logo"
                src={seller.imageUrl.trim()}
                alt=""
                loading="lazy"
              />
            </div>
          ) : null}
          <dl className="shop-profile-dl">
            <div className="shop-profile-row">
              <dt>Shop ID</dt>
              <dd>
                <code className="shop-profile-code">{seller.id}</code>
              </dd>
            </div>
            <div className="shop-profile-row">
              <dt>Phone</dt>
              <dd>{seller.phone ?? '—'}</dd>
            </div>
            <div className="shop-profile-row">
              <dt>Shop name</dt>
              <dd>{seller.shopName ?? '—'}</dd>
            </div>
            <div className="shop-profile-row">
              <dt>Owner name</dt>
              <dd>{seller.ownerName ?? '—'}</dd>
            </div>
            <div className="shop-profile-row">
              <dt>Location</dt>
              <dd>{displayCoords}</dd>
            </div>
            <div className="shop-profile-row">
              <dt>Address</dt>
              <dd>{seller.address ?? '—'}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <form className="card stack shop-profile-card" onSubmit={handleSave}>
          <div className="shop-profile-field">
            <span className="label">Shop ID</span>
            <code className="shop-profile-code">{seller.id}</code>
          </div>
          <div className="shop-profile-field">
            <span className="label">Shop logo</span>
            <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem' }}>
              JPG, PNG, or WebP — max ~1200px, compressed before upload.
            </p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              className="input"
              onChange={onLogoFile}
              disabled={saveBusy}
            />
            {logoPreviewUrl ? (
              <img
                className="image-upload-preview"
                style={{ marginTop: '0.65rem' }}
                src={logoPreviewUrl}
                alt="Logo preview"
              />
            ) : typeof seller.imageUrl === 'string' && seller.imageUrl.trim() ? (
              <img
                className="image-upload-preview"
                style={{ marginTop: '0.65rem' }}
                src={seller.imageUrl.trim()}
                alt="Current logo"
                loading="lazy"
              />
            ) : null}
            {saveBusy && pendingLogo ? (
              <div className="upload-progress" style={{ marginTop: '0.5rem' }} aria-hidden>
                <div
                  className="upload-progress__bar"
                  style={{ width: `${Math.max(logoUploadPct, 4)}%` }}
                />
              </div>
            ) : null}
          </div>
          <div className="shop-profile-field">
            <label className="label" htmlFor="sp-phone">
              Phone
            </label>
            <input
              id="sp-phone"
              className="input"
              type="tel"
              value={phone}
              onChange={(ev) => setPhone(ev.target.value)}
              required
            />
          </div>
          <div className="shop-profile-field">
            <label className="label" htmlFor="sp-shop">
              Shop name
            </label>
            <input
              id="sp-shop"
              className="input"
              type="text"
              value={shopName}
              onChange={(ev) => setShopName(ev.target.value)}
              required
            />
          </div>
          <div className="shop-profile-field">
            <label className="label" htmlFor="sp-owner">
              Owner name
            </label>
            <input
              id="sp-owner"
              className="input"
              type="text"
              value={ownerName}
              onChange={(ev) => setOwnerName(ev.target.value)}
              required
            />
          </div>
          <div className="shop-profile-field">
            <span className="label">Location (lat, lng)</span>
            <div className="shop-profile-latlng">
              <input
                id="sp-lat"
                className="input"
                type="text"
                inputMode="decimal"
                placeholder="Latitude"
                value={lat}
                onChange={(ev) => setLat(ev.target.value)}
                required
              />
              <input
                id="sp-lng"
                className="input"
                type="text"
                inputMode="decimal"
                placeholder="Longitude"
                value={lng}
                onChange={(ev) => setLng(ev.target.value)}
                required
              />
            </div>
          </div>
          <div className="shop-profile-field">
            <label className="label" htmlFor="sp-address">
              Address <span className="muted">(optional)</span>
            </label>
            <input
              id="sp-address"
              className="input"
              type="text"
              value={address}
              onChange={(ev) => setAddress(ev.target.value)}
            />
          </div>
          {formError ? <p className="error">{formError}</p> : null}
          <div className="shop-profile-actions-row">
            <button type="submit" className="btn btn-primary" disabled={saveBusy}>
              {saveBusy ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={cancelEdit}
              disabled={saveBusy}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLiveAccount ? (
        <section className="card stack shop-profile-trial" aria-label="Live account">
          <h2 className="shop-profile-section-title">Live account</h2>
          <p className="muted" style={{ margin: 0, fontSize: '0.9375rem' }}>
            You are on <strong style={{ color: 'var(--live)' }}>LIVE</strong> billing. Trial
            controls are hidden — use <Link to="/billing">Billing</Link> for balance and slots.
          </p>
        </section>
      ) : (
        <section
          className={`shop-profile-trial card${endingSoon && trialActive ? ' shop-profile-trial--warn' : ''}${!trialActive ? ' shop-profile-trial--expired' : ''}`}
          aria-label="Trial"
        >
          <h2 className="shop-profile-section-title">Trial</h2>
          {trialActive ? (
            <>
              <p className="shop-profile-trial-badge">Free Trial</p>
              {endingSoon ? (
                <p className="shop-profile-trial-warning">
                  Your trial ends in {daysLeft}{' '}
                  {daysLeft === 1 ? 'day' : 'days'} (within {TRIAL_ENDING_DAYS_THRESHOLD}{' '}
                  days). Consider going live soon.
                </p>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  <strong>{daysLeft}</strong> {daysLeft === 1 ? 'day' : 'days'} remaining.
                </p>
              )}
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Trial is not active or has expired. Start a new 15-day window below after
              accepting terms.
            </p>
          )}
        </section>
      )}

      <section className="card stack shop-profile-terms">
        <label className="shop-profile-terms-label">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(ev) => setTermsAccepted(ev.target.checked)}
          />
          <span>
            I accept the terms and conditions for trials, billing, and using FaFo as a
            seller.
          </span>
        </label>
        {blocked ? (
          <p className="error" style={{ margin: 0, fontSize: '0.875rem' }}>
            This shop is blocked. Contact support.
          </p>
        ) : null}
      </section>

      <section className="shop-profile-cta stack">
        {!isLiveAccount ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={actionsLocked || trialBusy || trialActive}
            onClick={handleStartTrial}
          >
            {trialBusy ? 'Starting…' : 'Start 15 days Trial'}
          </button>
        ) : null}
        {!isLiveAccount && trialActive ? (
          <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
            Trial already active — renew after it ends or contact support.
          </p>
        ) : null}

        {isLiveAccount ? (
          <Link to="/billing" className="btn btn-primary" style={{ textAlign: 'center' }}>
            Billing &amp; slots
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ borderColor: 'var(--gold-border)', color: '#fcd34d' }}
            disabled={actionsLocked}
            onClick={handleBuySlots}
          >
            Buy Slots &amp; Go Live
          </button>
        )}

        {waUrl ? (
          <a
            href={actionsLocked ? undefined : waUrl}
            className={`btn btn-ghost${actionsLocked ? ' shop-profile-link-disabled' : ''}`}
            style={{ textAlign: 'center', borderColor: '#25d366', color: '#25d366' }}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (actionsLocked) e.preventDefault();
            }}
          >
            Message on WhatsApp
          </a>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
            Set <code className="shop-profile-code">VITE_SUPPORT_WHATSAPP</code> in{' '}
            <code className="shop-profile-code">.env</code> or ensure your shop phone is
            set.
          </p>
        )}
      </section>

      {formError && !editing ? (
        <p className="error shop-profile-global-error">{formError}</p>
      ) : null}

      <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
        <Link to="/dashboard">← Back to dashboard</Link>
      </p>

      {toast ? (
        <div
          className={`app-toast${toast.variant === 'error' ? ' app-toast--error' : ''}`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
