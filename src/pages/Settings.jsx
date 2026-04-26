import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isDemoExplorer } from '../constants/demoMode';
import { useRegisterPageTitleSuffix } from '../context/SellerPageTitleContext';
import { useSeller } from '../hooks/useSeller';
import { updateSellerDocument } from '../services/firestore';
import {
  normalizeShopOpenManualMode,
  resolveShopOpenNow,
} from '../services/sellerHelpers';
import {
  compressImageToJpegBlob,
  isAcceptedImageType,
  uploadShopLogoJpeg,
} from '../services/storage';
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

  const [orderReadyTemplate, setOrderReadyTemplate] = useState('');
  const [templatesJson, setTemplatesJson] = useState('{}');

  const demo = isDemoExplorer();
  const settingsTabLabel = TABS.find((t) => t.id === tab)?.label ?? '';
  useRegisterPageTitleSuffix(settingsTabLabel);

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
    if (demo) {
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
        <Link to="/onboarding" className="btn btn-primary">
          Set up shop
        </Link>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-page-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`settings-page-tab${tab === t.id ? ' settings-page-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
            disabled={demo}
          >
            {t.label}
          </button>
        ))}
      </div>

      <fieldset className="fieldset-reset" disabled={demo}>
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
      </fieldset>

      <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
        <Link to="/dashboard">← Back to dashboard</Link>
      </p>
    </div>
  );
}
