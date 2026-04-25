import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { isDemoExplorer } from '../constants/demoMode';
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
  normalizeShopOpenManualMode,
  resolveEffectiveSellerMode,
  resolveShopOpenNow,
  TRIAL_ENDING_DAYS_THRESHOLD,
} from '../services/sellerHelpers';
import { reverseGeocodeLatLng } from '../utils/reverseGeocode';
import { CompactTimeInput } from '../components/CompactTimeInput';

function locationToCoords(seller) {
  if (!seller) return { lat: '', lng: '' };
  const loc = seller.location;
  if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
    return { lat: loc.latitude, lng: loc.longitude };
  }
  const lat = Number(seller.lat ?? seller.latitude);
  const lng = Number(seller.lng ?? seller.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
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

  const [shopTags, setShopTags] = useState('');
  const [description, setDescription] = useState('');
  const [openingTime, setOpeningTime] = useState('');
  const [closingTime, setClosingTime] = useState('');
  const [shopOpenManualMode, setShopOpenManualMode] = useState('auto');

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState('');

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
    const c = locationToCoords(seller);
    setLat(c.lat === '' ? '' : String(c.lat));
    setLng(c.lng === '' ? '' : String(c.lng));
    const st = seller.shopTags ?? seller.tags;
    if (Array.isArray(st)) setShopTags(st.join(', '));
    else if (typeof st === 'string') setShopTags(st);
    else setShopTags('');
    setDescription(typeof seller.description === 'string' ? seller.description : '');
    setOpeningTime(seller.openingTime ?? seller.openTime ?? '');
    setClosingTime(seller.closingTime ?? seller.closeTime ?? '');
    setShopOpenManualMode(normalizeShopOpenManualMode(seller.shopOpenManualMode));
  }, [seller, editing]);

  useEffect(() => {
    if (!seller || editing) {
      setResolvedAddress('');
      return undefined;
    }
    const c = locationToCoords(seller);
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) {
      setResolvedAddress('');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const label = await reverseGeocodeLatLng(c.lat, c.lng);
      if (!cancelled) setResolvedAddress(label);
    })();
    return () => {
      cancelled = true;
    };
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
    if (isDemoExplorer()) return;
    if (!seller) return;
    setFormError('');
    clearLogoPick();
    const c = locationToCoords(seller);
    setShopName(seller.shopName ?? '');
    setOwnerName(seller.ownerName ?? '');
    setPhone(seller.phone ?? '');
    setAddress(seller.address ?? '');
    setLat(c.lat === '' ? '' : String(c.lat));
    setLng(c.lng === '' ? '' : String(c.lng));
    const st = seller.shopTags ?? seller.tags;
    if (Array.isArray(st)) setShopTags(st.join(', '));
    else if (typeof st === 'string') setShopTags(st);
    else setShopTags('');
    setDescription(typeof seller.description === 'string' ? seller.description : '');
    setOpeningTime(seller.openingTime ?? seller.openTime ?? '');
    setClosingTime(seller.closingTime ?? seller.closeTime ?? '');
    setShopOpenManualMode(normalizeShopOpenManualMode(seller.shopOpenManualMode));
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
      const merged = {
        ...seller,
        shopOpenManualMode,
        openingTime,
        closingTime,
        openTime: openingTime,
        closeTime: closingTime,
      };
      const nextOpen = resolveShopOpenNow(merged);
      const updates = {
        shopName,
        ownerName,
        phone,
        address,
        lat: lt,
        lng: lg,
        shopTags,
        tags: shopTags,
        description,
        openingTime,
        closingTime,
        openTime: openingTime,
        closeTime: closingTime,
        shopOpenManualMode,
      };
      if (nextOpen !== null) {
        updates.shopOpenNow = nextOpen;
      }
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
        <p className="muted" style={{ margin: 0 }}>
          Create your seller profile first.
        </p>
        <Link to="/onboarding" className="btn btn-primary">
          Set up shop
        </Link>
      </div>
    );
  }

  const coords = locationToCoords(seller);
  const displayCoords = formatCoords(coords.lat, coords.lng);
  const locationLine =
    resolvedAddress && displayCoords !== '—'
      ? `${resolvedAddress} · ${displayCoords}`
      : resolvedAddress || displayCoords;

  const hideProfileBilling =
    effective === 'live' &&
    (Number(seller?.approvedRechargeTotal ?? 0) > 0 || seller?.hasLiveHistory === true);

  return (
    <div className="shop-profile">
      {!editing ? (
        <div className="shop-profile-card-wrap">
          {!isDemoExplorer() ? (
            <button
              type="button"
              className="shop-profile-edit-fab"
              onClick={beginEdit}
              aria-label="Edit shop profile"
            >
              <Pencil size={18} strokeWidth={2.1} aria-hidden />
            </button>
          ) : null}
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
              <dt>Tags</dt>
              <dd>
                {Array.isArray(seller.shopTags)
                  ? seller.shopTags.join(', ')
                  : typeof seller.shopTags === 'string'
                    ? seller.shopTags
                    : Array.isArray(seller.tags)
                      ? seller.tags.join(', ')
                      : typeof seller.tags === 'string'
                        ? seller.tags
                        : '—'}
              </dd>
            </div>
            <div className="shop-profile-row">
              <dt>Description</dt>
              <dd>{seller.description ?? '—'}</dd>
            </div>
            <div className="shop-profile-row">
              <dt>Hours</dt>
              <dd>
                {seller.openingTime ?? seller.openTime ?? '—'} –{' '}
                {seller.closingTime ?? seller.closeTime ?? '—'}
              </dd>
            </div>
            <div className="shop-profile-row">
              <dt>Open mode</dt>
              <dd>{normalizeShopOpenManualMode(seller.shopOpenManualMode)}</dd>
            </div>
            <div className="shop-profile-row">
              <dt>Owner name</dt>
              <dd>{seller.ownerName ?? '—'}</dd>
            </div>
            <div className="shop-profile-row">
              <dt>Location</dt>
              <dd>{locationLine}</dd>
            </div>
            <div className="shop-profile-row">
              <dt>Address</dt>
              <dd>{seller.address ?? '—'}</dd>
            </div>
          </dl>
          </div>
        </div>
      ) : (
        <fieldset className="fieldset-reset" disabled={isDemoExplorer()}>
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
            <label className="label" htmlFor="sp-tags">
              Tags (comma-separated)
            </label>
            <input
              id="sp-tags"
              className="input"
              type="text"
              value={shopTags}
              onChange={(ev) => setShopTags(ev.target.value)}
              placeholder="street food, vegan options"
            />
          </div>
          <div className="shop-profile-field">
            <label className="label" htmlFor="sp-desc">
              Description
            </label>
            <textarea
              id="sp-desc"
              className="input add-item-textarea"
              rows={3}
              value={description}
              onChange={(ev) => setDescription(ev.target.value)}
              placeholder="What buyers should know"
            />
          </div>
          <div className="shop-profile-field">
            <span className="label">Opening & closing</span>
            <div className="shop-profile-latlng">
              <CompactTimeInput
                id="sp-open"
                value={openingTime}
                onChange={setOpeningTime}
                disabled={saveBusy}
                hourLabel="Opening hour"
                minuteLabel="Opening minute"
              />
              <CompactTimeInput
                id="sp-close"
                value={closingTime}
                onChange={setClosingTime}
                disabled={saveBusy}
                hourLabel="Closing hour"
                minuteLabel="Closing minute"
              />
            </div>
          </div>
          <div className="shop-profile-field">
            <span className="label">Open mode (buyer view)</span>
            <div className="shop-profile-actions-row" style={{ flexWrap: 'wrap' }}>
              {['auto', 'open', 'closed'].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`btn btn--sm${shopOpenManualMode === m ? ' btn-primary' : ' btn-ghost'}`}
                  onClick={() => setShopOpenManualMode(m)}
                >
                  {m === 'auto' ? 'Auto (hours)' : m === 'open' ? 'Always open' : 'Always closed'}
                </button>
              ))}
            </div>
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
        </fieldset>
      )}

      <fieldset className="fieldset-reset" disabled={isDemoExplorer()}>
      {!hideProfileBilling ? (
        isLiveAccount ? (
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
        )
      ) : null}

      {!hideProfileBilling ? (
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
      ) : null}

      {!hideProfileBilling ? (
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
      ) : null}
      </fieldset>

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
