import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isDemoExplorer } from '../constants/demoMode';
import { useSeller } from '../hooks/useSeller';
import { changeSellerShopLoginPassword, updateSellerDocument } from '../services/firestore';
import {
  normalizeShopOpenManualMode,
  resolveShopOpenNow,
} from '../services/sellerHelpers';
import {
  compressImageToJpegBlob,
  isAcceptedImageType,
  uploadShopLogoJpeg,
  uploadUpiQrJpeg,
} from '../services/storage';
import { buildUpiPayUrl } from '../services/upi';
import { PublicShopAccessSection } from '../components/PublicShopAccessSection';

const TABS = [
  { id: 'shop', label: 'Shop profile' },
  { id: 'upi', label: 'UPI details' },
  { id: 'templates', label: 'Templates' },
  { id: 'public', label: 'Public shop access' },
];

export function Settings() {
  const { seller, sellerId, loading, error, reload } = useSeller();
  const [tab, setTab] = useState('shop');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [shopName, setShopName] = useState('');
  const [shopTags, setShopTags] = useState('');
  const [description, setDescription] = useState('');
  const [cuisineTags, setCuisineTags] = useState('');
  const [openingTime, setOpeningTime] = useState('');
  const [closingTime, setClosingTime] = useState('');
  const [holidays, setHolidays] = useState('');
  const [shopImageBusy, setShopImageBusy] = useState(false);
  const [shopOpenManualMode, setShopOpenManualMode] = useState('auto');
  const [applyOpenBusy, setApplyOpenBusy] = useState(false);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [deliveryRules, setDeliveryRules] = useState('');
  const [deliveryMinOrder, setDeliveryMinOrder] = useState('');
  const [deliveryMaxDistanceKm, setDeliveryMaxDistanceKm] = useState('');
  const [deliveryFreeAbove, setDeliveryFreeAbove] = useState('');
  const [globalDiscountText, setGlobalDiscountText] = useState('');
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState('');

  const [upiId, setUpiId] = useState('');
  const [upiName, setUpiName] = useState('');
  const [upiPhone, setUpiPhone] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [qrUploadBusy, setQrUploadBusy] = useState(false);
  const [upiPreviewAmount, setUpiPreviewAmount] = useState('1');

  const [orderReadyTemplate, setOrderReadyTemplate] = useState('');
  const [templatesJson, setTemplatesJson] = useState('{}');

  const [shopPwCurrent, setShopPwCurrent] = useState('');
  const [shopPwNew, setShopPwNew] = useState('');
  const [shopPwNew2, setShopPwNew2] = useState('');
  const [shopPwBusy, setShopPwBusy] = useState(false);
  const [shopPwMsg, setShopPwMsg] = useState('');

  useEffect(() => {
    if (!seller) return;
    setShopName(typeof seller.shopName === 'string' ? seller.shopName : '');
    const st = seller.shopTags ?? seller.tags;
    if (Array.isArray(st)) setShopTags(st.join(', '));
    else if (typeof st === 'string') setShopTags(st);
    else setShopTags('');
    setDescription(typeof seller.description === 'string' ? seller.description : '');
    const tags = seller.cuisineTags;
    if (Array.isArray(tags)) setCuisineTags(tags.join(', '));
    else if (typeof tags === 'string') setCuisineTags(tags);
    else setCuisineTags('');
    setOpeningTime(seller.openingTime ?? seller.openTime ?? '');
    setClosingTime(seller.closingTime ?? seller.closeTime ?? '');
    setHolidays(typeof seller.holidays === 'string' ? seller.holidays : '');
    setShopOpenManualMode(normalizeShopOpenManualMode(seller.shopOpenManualMode));
    setDeliveryEnabled(Boolean(seller.deliveryEnabled));
    setDeliveryRules(seller.deliveryRules ?? '');
    const dMin = seller.deliveryMinOrder;
    setDeliveryMinOrder(
      dMin != null && Number.isFinite(Number(dMin)) ? String(dMin) : '',
    );
    const dMax = seller.deliveryMaxDistanceKm;
    setDeliveryMaxDistanceKm(
      dMax != null && Number.isFinite(Number(dMax)) ? String(dMax) : '',
    );
    const dFree = seller.deliveryFreeAbove;
    setDeliveryFreeAbove(
      dFree != null && Number.isFinite(Number(dFree)) ? String(dFree) : '',
    );
    setGlobalDiscountText(
      typeof seller.globalDiscountText === 'string' ? seller.globalDiscountText : '',
    );
    const g = seller.globalDiscountPercent;
    setGlobalDiscountPercent(
      g != null && Number.isFinite(Number(g)) ? String(g) : '',
    );
    setUpiId(seller.upiId ?? '');
    setUpiName(seller.upiName ?? '');
    setUpiPhone(seller.upiPhone ?? '');
    setQrImage(seller.qrImage ?? '');
    setOrderReadyTemplate(seller.orderReadyTemplate ?? '');
    try {
      setTemplatesJson(
        seller.messageTemplates && typeof seller.messageTemplates === 'object'
          ? JSON.stringify(seller.messageTemplates, null, 2)
          : '{}',
      );
    } catch {
      setTemplatesJson('{}');
    }
  }, [seller]);

  const buyerOpenPreview = useMemo(() => {
    if (!seller) return null;
    return resolveShopOpenNow({
      ...seller,
      shopOpenManualMode,
      openingTime,
      closingTime,
      openTime: openingTime,
      closeTime: closingTime,
    });
  }, [seller, shopOpenManualMode, openingTime, closingTime]);

  async function applyShopOpenManualMode(mode) {
    if (!sellerId) return;
    const m = normalizeShopOpenManualMode(mode);
    setShopOpenManualMode(m);
    if (isDemoExplorer()) {
      setSaveMsg('Demo mode is read-only — sign in to apply.');
      return;
    }
    setApplyOpenBusy(true);
    setSaveMsg('');
    try {
      const merged = {
        ...seller,
        shopOpenManualMode: m,
        openingTime,
        closingTime,
        openTime: openingTime,
        closeTime: closingTime,
      };
      const next = resolveShopOpenNow(merged);
      const patch = { shopOpenManualMode: m };
      if (next !== null) {
        patch.shopOpenNow = next;
      }
      await updateSellerDocument(sellerId, patch);
      setSaveMsg(
        m === 'auto'
          ? 'Buyers follow your hours again.'
          : m === 'open'
            ? 'Buyers now always see your shop as open.'
            : 'Buyers now always see your shop as closed.',
      );
      reload();
    } catch (err) {
      setSaveMsg(err.message ?? 'Could not update open/closed.');
    } finally {
      setApplyOpenBusy(false);
    }
  }

  async function saveShop(e) {
    e.preventDefault();
    if (!sellerId) return;
    setSaveBusy(true);
    setSaveMsg('');
    try {
      const dMin = deliveryMinOrder.trim() === '' ? null : Number(deliveryMinOrder);
      const dMax = deliveryMaxDistanceKm.trim() === '' ? null : Number(deliveryMaxDistanceKm);
      const dFree = deliveryFreeAbove.trim() === '' ? null : Number(deliveryFreeAbove);
      const gPct = globalDiscountPercent.trim() === '' ? null : Number(globalDiscountPercent);
      const merged = {
        ...seller,
        shopOpenManualMode,
        openingTime,
        closingTime,
        openTime: openingTime,
        closeTime: closingTime,
      };
      const nextOpen = resolveShopOpenNow(merged);
      const patch = {
        shopName,
        shopTags,
        tags: shopTags,
        description,
        cuisineTags,
        openingTime,
        closingTime,
        openTime: openingTime,
        closeTime: closingTime,
        holidays,
        shopOpenManualMode,
        deliveryEnabled,
        deliveryRules,
        deliveryMinOrder: dMin,
        deliveryMaxDistanceKm: dMax,
        deliveryFreeAbove: dFree,
        globalDiscountText,
        globalDiscountPercent: gPct,
      };
      if (nextOpen !== null) {
        patch.shopOpenNow = nextOpen;
      }
      await updateSellerDocument(sellerId, patch);
      setSaveMsg('Saved.');
      reload();
    } catch (err) {
      setSaveMsg(err.message ?? 'Save failed.');
    } finally {
      setSaveBusy(false);
    }
  }

  async function saveUpi(e) {
    e.preventDefault();
    if (!sellerId) return;
    setSaveBusy(true);
    setSaveMsg('');
    try {
      await updateSellerDocument(sellerId, {
        upiId,
        upiName,
        upiPhone,
        qrImage,
        qrCodeUrl: qrImage,
      });
      setSaveMsg('Saved.');
      reload();
    } catch (err) {
      setSaveMsg(err.message ?? 'Save failed.');
    } finally {
      setSaveBusy(false);
    }
  }

  async function onShopImageFile(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file || !sellerId) return;
    if (!isAcceptedImageType(file)) {
      setSaveMsg('Use JPG, PNG, or WebP for the shop image.');
      return;
    }
    setShopImageBusy(true);
    setSaveMsg('');
    try {
      const blob = await compressImageToJpegBlob(file);
      const url = await uploadShopLogoJpeg(sellerId, blob);
      await updateSellerDocument(sellerId, { imageUrl: url });
      setSaveMsg('Shop image uploaded.');
      reload();
    } catch (err) {
      setSaveMsg(err.message ?? 'Upload failed.');
    } finally {
      setShopImageBusy(false);
    }
  }

  async function onQrFile(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file || !sellerId) return;
    if (!isAcceptedImageType(file)) {
      setSaveMsg('Use JPG, PNG, or WebP for the QR image.');
      return;
    }
    setQrUploadBusy(true);
    setSaveMsg('');
    try {
      const blob = await compressImageToJpegBlob(file);
      const url = await uploadUpiQrJpeg(sellerId, blob);
      setQrImage(url);
      await updateSellerDocument(sellerId, { qrImage: url });
      setSaveMsg('QR image uploaded.');
      reload();
    } catch (err) {
      setSaveMsg(err.message ?? 'Upload failed.');
    } finally {
      setQrUploadBusy(false);
    }
  }

  async function saveShopLoginPassword(e) {
    e.preventDefault();
    if (!sellerId) return;
    setShopPwBusy(true);
    setShopPwMsg('');
    const hasPwd =
      seller &&
      typeof seller.password === 'string' &&
      String(seller.password).length > 0;
    if (isDemoExplorer()) {
      setShopPwMsg('Demo mode is read-only — sign in to change password.');
      setShopPwBusy(false);
      return;
    }
    const nw = shopPwNew.trim();
    const nw2 = shopPwNew2.trim();
    if (nw.length < 6) {
      setShopPwMsg('New password must be at least 6 characters.');
      setShopPwBusy(false);
      return;
    }
    if (nw !== nw2) {
      setShopPwMsg('New passwords do not match.');
      setShopPwBusy(false);
      return;
    }
    try {
      await changeSellerShopLoginPassword(sellerId, {
        currentPassword: hasPwd ? shopPwCurrent : '',
        newPassword: nw,
      });
      setShopPwMsg('Shop login password updated.');
      setShopPwCurrent('');
      setShopPwNew('');
      setShopPwNew2('');
      reload();
    } catch (err) {
      setShopPwMsg(err.message ?? 'Could not update password.');
    } finally {
      setShopPwBusy(false);
    }
  }

  async function saveTemplates(e) {
    e.preventDefault();
    if (!sellerId) return;
    setSaveBusy(true);
    setSaveMsg('');
    try {
      let messageTemplates = {};
      const trimmed = templatesJson.trim();
      if (trimmed) {
        messageTemplates = JSON.parse(trimmed);
        if (typeof messageTemplates !== 'object' || messageTemplates === null) {
          throw new Error('Templates must be a JSON object.');
        }
      }
      await updateSellerDocument(sellerId, {
        orderReadyTemplate,
        messageTemplates,
      });
      setSaveMsg('Saved.');
      reload();
    } catch (err) {
      setSaveMsg(err.message ?? 'Save failed — check JSON.');
    } finally {
      setSaveBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="settings-page card">
        <p className="muted" style={{ margin: 0 }}>
          Loading…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="settings-page card stack">
        <p className="error" style={{ margin: 0 }}>
          {error.message ?? 'Error'}
        </p>
        <Link to="/" className="btn btn-ghost">
          Home
        </Link>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="settings-page card stack">
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Settings</h1>
        <Link to="/onboarding" className="btn btn-primary">
          Set up shop
        </Link>
      </div>
    );
  }

  const demo = isDemoExplorer();

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <h1 style={{ margin: 0, fontSize: '1.35rem', letterSpacing: '-0.02em' }}>
          Settings
        </h1>
      </header>

      <div className="settings-page-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`settings-page-tab${tab === t.id ? ' settings-page-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {saveMsg ? (
        <p
          className={
            /fail|Could not|required|Use JPG|read-only/i.test(saveMsg) ? 'error' : 'muted'
          }
          style={{ margin: 0 }}
        >
          {saveMsg}
        </p>
      ) : null}

      {shopPwMsg ? (
        <p
          className={
            /fail|Could not|incorrect|match|read-only|at least/i.test(shopPwMsg) ? 'error' : 'muted'
          }
          style={{ margin: 0 }}
        >
          {shopPwMsg}
        </p>
      ) : null}

      {tab === 'shop' ? (
        <form className="card stack settings-page-form" onSubmit={saveShop}>
          <div className="add-item-field">
            <label className="label" htmlFor="set-shop-name">
              Shop name
            </label>
            <input
              id="set-shop-name"
              className="input"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-shop-img">
              Shop image
            </label>
            <input
              id="set-shop-img"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="input"
              disabled={shopImageBusy || demo}
              onChange={onShopImageFile}
            />
            {shopImageBusy ? <p className="muted" style={{ margin: 0 }}>Uploading…</p> : null}
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-shop-tags">
              Tags (comma-separated)
            </label>
            <input
              id="set-shop-tags"
              className="input"
              value={shopTags}
              onChange={(e) => setShopTags(e.target.value)}
              placeholder="e.g. vegan, quick lunch"
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-desc">
              Description
            </label>
            <textarea
              id="set-desc"
              className="input add-item-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-cuisine">
              Cuisine tags (comma-separated)
            </label>
            <input
              id="set-cuisine"
              className="input"
              value={cuisineTags}
              onChange={(e) => setCuisineTags(e.target.value)}
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-open">
              Opening time
            </label>
            <input
              id="set-open"
              className="input"
              value={openingTime}
              onChange={(e) => setOpeningTime(e.target.value)}
              placeholder="e.g. 09:00"
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-close">
              Closing time
            </label>
            <input
              id="set-close"
              className="input"
              value={closingTime}
              onChange={(e) => setClosingTime(e.target.value)}
              placeholder="e.g. 22:00"
            />
          </div>
          <div className="add-item-field" role="group" aria-labelledby="set-open-mode-label">
            <span className="label" id="set-open-mode-label">
              Shop open for buyers
            </span>
            <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem' }}>
              Manual choice applies immediately. Choose <strong>Automatic</strong> to use only
              the opening and closing times below (local time on this device).
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {[
                { id: 'auto', label: 'Automatic (hours)' },
                { id: 'open', label: 'Always open' },
                { id: 'closed', label: 'Always closed' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`btn${shopOpenManualMode === id ? ' btn-primary' : ' btn-ghost'}`}
                  disabled={demo || applyOpenBusy}
                  onClick={() => applyShopOpenManualMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {applyOpenBusy ? (
              <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem' }}>
                Applying…
              </p>
            ) : null}
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-holidays">
              Holidays / closed days
            </label>
            <textarea
              id="set-holidays"
              className="input add-item-textarea"
              rows={2}
              value={holidays}
              onChange={(e) => setHolidays(e.target.value)}
              placeholder="e.g. Closed Sundays · Dec 25"
            />
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
            {shopOpenManualMode === 'open'
              ? 'Buyers see: Open now — manual override (ignores hours until you switch back).'
              : shopOpenManualMode === 'closed'
                ? 'Buyers see: Closed — manual override (ignores hours until you switch back).'
                : buyerOpenPreview === true
                  ? 'Buyers see: Open now (automatic — from hours above, local time).'
                  : buyerOpenPreview === false
                    ? 'Buyers see: Closed now (automatic — from hours above, local time).'
                    : 'Set both times as HH:mm so automatic mode can show open / closed.'}
          </p>
          <label className="orders-page-wa-pref settings-page-check">
            <input
              type="checkbox"
              checked={deliveryEnabled}
              onChange={(e) => setDeliveryEnabled(e.target.checked)}
            />
            <span>Delivery enabled</span>
          </label>
          <div className="add-item-field">
            <label className="label" htmlFor="set-rules">
              Delivery rules
            </label>
            <textarea
              id="set-rules"
              className="input add-item-textarea"
              rows={2}
              value={deliveryRules}
              onChange={(e) => setDeliveryRules(e.target.value)}
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-del-min">
              Minimum order for delivery (₹, optional)
            </label>
            <input
              id="set-del-min"
              className="input"
              type="number"
              min="0"
              step="1"
              value={deliveryMinOrder}
              onChange={(e) => setDeliveryMinOrder(e.target.value)}
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-del-max-km">
              Max delivery distance (km, optional)
            </label>
            <input
              id="set-del-max-km"
              className="input"
              type="number"
              min="0"
              step="0.1"
              value={deliveryMaxDistanceKm}
              onChange={(e) => setDeliveryMaxDistanceKm(e.target.value)}
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-del-free">
              Free delivery above (₹, optional)
            </label>
            <input
              id="set-del-free"
              className="input"
              type="number"
              min="0"
              step="1"
              value={deliveryFreeAbove}
              onChange={(e) => setDeliveryFreeAbove(e.target.value)}
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-gdisc-text">
              Shop-wide offer text (optional)
            </label>
            <input
              id="set-gdisc-text"
              className="input"
              value={globalDiscountText}
              onChange={(e) => setGlobalDiscountText(e.target.value)}
              placeholder="e.g. Buy 2 get 1 · Today only"
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-gdisc-pct">
              Shop-wide % off (optional)
            </label>
            <input
              id="set-gdisc-pct"
              className="input"
              type="number"
              min="0"
              step="0.1"
              value={globalDiscountPercent}
              onChange={(e) => setGlobalDiscountPercent(e.target.value)}
              placeholder="e.g. 10"
            />
          </div>
          {demo ? (
            <p className="muted" style={{ margin: 0 }}>
              Demo mode is read-only — sign in to save shop settings.
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={saveBusy || demo}>
            {saveBusy ? 'Saving…' : 'Save shop settings'}
          </button>
        </form>
      ) : null}

      {tab === 'upi' ? (
        <form className="card stack settings-page-form" onSubmit={saveUpi}>
          <div className="add-item-field">
            <label className="label" htmlFor="set-upi">
              UPI ID (pa)
            </label>
            <input
              id="set-upi"
              className="input"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="name@bank"
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-upi-name">
              Payee name (pn)
            </label>
            <input
              id="set-upi-name"
              className="input"
              value={upiName}
              onChange={(e) => setUpiName(e.target.value)}
              placeholder="Shown in UPI apps"
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-upi-phone">
              UPI phone (optional)
            </label>
            <input
              id="set-upi-phone"
              className="input"
              type="tel"
              value={upiPhone}
              onChange={(e) => setUpiPhone(e.target.value)}
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-qr-file">
              Upload UPI QR (JPEG to Storage)
            </label>
            <input
              id="set-qr-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="input"
              disabled={qrUploadBusy || demo}
              onChange={onQrFile}
            />
            {qrUploadBusy ? <p className="muted" style={{ margin: 0 }}>Uploading…</p> : null}
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-qr">
              QR image URL (optional override)
            </label>
            <input
              id="set-qr"
              className="input"
              value={qrImage}
              onChange={(e) => setQrImage(e.target.value)}
              placeholder="https://…"
            />
          </div>
          {qrImage.trim() ? (
            <div className="add-item-field">
              <span className="label">QR preview</span>
              <img
                src={qrImage.trim()}
                alt="Saved UPI QR"
                className="settings-qr-preview"
                loading="lazy"
              />
            </div>
          ) : null}
          <div className="add-item-field">
            <label className="label" htmlFor="set-upi-amt">
              Test amount for UPI link (₹)
            </label>
            <input
              id="set-upi-amt"
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={upiPreviewAmount}
              onChange={(e) => setUpiPreviewAmount(e.target.value)}
            />
          </div>
          {upiId.trim() ? (
            <p className="muted" style={{ margin: 0, fontSize: '0.8125rem', wordBreak: 'break-all' }}>
              Buyer deeplink example:{' '}
              <a
                href={buildUpiPayUrl({
                  pa: upiId.trim(),
                  pn: upiName.trim(),
                  am: String(
                    Number.isFinite(Number(upiPreviewAmount)) ? Number(upiPreviewAmount) : 1,
                  ),
                })}
                className="settings-upi-link"
              >
                {buildUpiPayUrl({
                  pa: upiId.trim(),
                  pn: upiName.trim(),
                  am: String(
                    Number.isFinite(Number(upiPreviewAmount)) ? Number(upiPreviewAmount) : 1,
                  ),
                })}
              </a>
            </p>
          ) : null}
          {demo ? (
            <p className="muted" style={{ margin: 0 }}>
              Demo mode is read-only — sign in to save UPI details.
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={saveBusy || demo}>
            {saveBusy ? 'Saving…' : 'Save UPI details'}
          </button>
        </form>
      ) : null}

      {tab === 'public' ? (
        <div className="stack settings-page-public-wrap" style={{ gap: '0.75rem' }}>
          <PublicShopAccessSection seller={seller} sellerId={sellerId} readOnly={demo} />
          <form className="card stack settings-page-form" onSubmit={saveShopLoginPassword}>
            <h2 className="settings-section-h2" style={{ margin: 0, fontSize: '1rem' }}>
              Shop code login
            </h2>
            <p className="muted" style={{ margin: 0, fontSize: '0.9375rem' }}>
              Password used with <strong>Shop code</strong> sign-in (separate from your Google or phone
              account).
            </p>
            {seller &&
            typeof seller.password === 'string' &&
            String(seller.password).length > 0 ? (
              <div className="add-item-field">
                <label className="label" htmlFor="set-shop-pw-current">
                  Current password
                </label>
                <input
                  id="set-shop-pw-current"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={shopPwCurrent}
                  onChange={(e) => setShopPwCurrent(e.target.value)}
                />
              </div>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
                No shop password on file yet — set one here to enable shop-code login, or complete
                onboarding with a password if you are new.
              </p>
            )}
            <div className="add-item-field">
              <label className="label" htmlFor="set-shop-pw-new">
                New password
              </label>
              <input
                id="set-shop-pw-new"
                className="input"
                type="password"
                autoComplete="new-password"
                value={shopPwNew}
                onChange={(e) => setShopPwNew(e.target.value)}
                minLength={6}
              />
            </div>
            <div className="add-item-field">
              <label className="label" htmlFor="set-shop-pw-new2">
                Confirm new password
              </label>
              <input
                id="set-shop-pw-new2"
                className="input"
                type="password"
                autoComplete="new-password"
                value={shopPwNew2}
                onChange={(e) => setShopPwNew2(e.target.value)}
                minLength={6}
              />
            </div>
            {demo ? (
              <p className="muted" style={{ margin: 0 }}>
                Demo mode is read-only.
              </p>
            ) : null}
            <button type="submit" className="btn btn-primary" disabled={shopPwBusy || demo}>
              {shopPwBusy ? 'Saving…' : 'Update shop login password'}
            </button>
          </form>
        </div>
      ) : null}

      {tab === 'templates' ? (
        <form className="card stack settings-page-form" onSubmit={saveTemplates}>
          <div className="add-item-field">
            <label className="label" htmlFor="set-ready-tpl">
              Order ready message (WhatsApp)
            </label>
            <textarea
              id="set-ready-tpl"
              className="input add-item-textarea"
              rows={2}
              value={orderReadyTemplate}
              onChange={(e) => setOrderReadyTemplate(e.target.value)}
              placeholder="Hi, your order is ready for pickup"
            />
          </div>
          <div className="add-item-field">
            <label className="label" htmlFor="set-tpl-json">
              Message templates (JSON object)
            </label>
            <textarea
              id="set-tpl-json"
              className="input add-item-textarea settings-page-json"
              rows={8}
              value={templatesJson}
              onChange={(e) => setTemplatesJson(e.target.value)}
              spellCheck={false}
            />
          </div>
          {demo ? (
            <p className="muted" style={{ margin: 0 }}>
              Demo mode is read-only — sign in to save templates.
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={saveBusy || demo}>
            {saveBusy ? 'Saving…' : 'Save templates'}
          </button>
        </form>
      ) : null}

      <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
        <Link to="/dashboard">← Back to dashboard</Link>
      </p>
    </div>
  );
}
