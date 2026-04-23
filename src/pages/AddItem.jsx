import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSeller } from '../hooks/useSeller';
import { useSimpleToast } from '../hooks/useSimpleToast';
import {
  createProduct,
  deleteProduct,
  getProductForSeller,
  parseStoredProductCategories,
  recomputeSellerSlotCount,
  updateProduct,
} from '../services/firestore';
import { listMenuGroups } from '../services/menuGroupsService';
import {
  compressImageToJpegBlob,
  isAcceptedImageType,
  uploadProductImageJpeg,
} from '../services/storage';

function buildTags(fastSelling, special) {
  const tags = [];
  if (fastSelling) tags.push('Fast Selling');
  if (special) tags.push('Special');
  return tags;
}

function productDisplayName(p) {
  const n = p?.name ?? p?.title;
  return typeof n === 'string' ? n : '';
}

export function AddItem() {
  const navigate = useNavigate();
  const { productId } = useParams();
  const isEdit = Boolean(productId);
  const { seller, loading: sellerLoading, error: sellerError } = useSeller();
  const { toast, showToast } = useSimpleToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisineCategory, setCuisineCategory] = useState('');
  const [menuCategory, setMenuCategory] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [price, setPrice] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [quantity, setQuantity] = useState(0);

  const [tagFastSelling, setTagFastSelling] = useState(false);
  const [tagSpecial, setTagSpecial] = useState(false);
  const [available, setAvailable] = useState(true);
  const [menuGroupId, setMenuGroupId] = useState('');
  const [menuGroups, setMenuGroups] = useState([]);
  const [discountLabel, setDiscountLabel] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');

  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [productLoading, setProductLoading] = useState(isEdit);
  const [productLoadError, setProductLoadError] = useState(null);

  const [pendingImage, setPendingImage] = useState(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState('');
  const [existingImageUrl, setExistingImageUrl] = useState('');
  const [imageUploadPct, setImageUploadPct] = useState(0);
  const imagePreviewRevoke = useRef(null);

  useEffect(() => {
    return () => {
      if (imagePreviewRevoke.current) {
        URL.revokeObjectURL(imagePreviewRevoke.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!seller?.id) {
      setMenuGroups([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await listMenuGroups(seller.id);
        if (!cancelled) setMenuGroups(rows);
      } catch {
        if (!cancelled) setMenuGroups([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seller?.id]);

  useEffect(() => {
    if (!isEdit) {
      setProductLoading(false);
      setProductLoadError(null);
      return undefined;
    }
    if (!seller?.id) {
      return undefined;
    }

    let cancelled = false;
    setProductLoading(true);
    setProductLoadError(null);

    (async () => {
      try {
        const p = await getProductForSeller(productId, seller.id);
        if (cancelled) return;
        if (!p) {
          setProductLoadError('Item not found or you do not have access.');
          setProductLoading(false);
          return;
        }

        setName(productDisplayName(p) || '');
        setDescription(
          typeof p.description === 'string' ? p.description : '',
        );
        setCuisineCategory(
          typeof p.cuisineCategory === 'string' ? p.cuisineCategory : '',
        );
        const { menuCategory: m, itemCategory: i } = parseStoredProductCategories(
          p.category,
        );
        setMenuCategory(m);
        setItemCategory(i);
        setPrice(
          p.price != null && Number.isFinite(Number(p.price))
            ? String(p.price)
            : '',
        );
        setPrepTime(typeof p.prepTime === 'string' ? p.prepTime : '');
        const q = Number(p.quantity);
        setQuantity(Number.isFinite(q) ? Math.max(0, Math.floor(q)) : 0);

        const tags = Array.isArray(p.tags) ? p.tags : [];
        setTagFastSelling(tags.includes('Fast Selling'));
        setTagSpecial(tags.includes('Special'));
        setAvailable(p.available !== false && p.available !== 0);

        const dl = p.discountLabel;
        setDiscountLabel(typeof dl === 'string' ? dl : '');
        const dp = p.discountPercent;
        setDiscountPercent(
          dp != null && Number.isFinite(Number(dp)) ? String(dp) : '',
        );

        const img =
          typeof p.imageUrl === 'string' && p.imageUrl.trim()
            ? p.imageUrl.trim()
            : typeof p.image === 'string' && p.image.trim()
              ? p.image.trim()
              : '';
        setExistingImageUrl(img);

        const mg = p.menuGroupId;
        setMenuGroupId(typeof mg === 'string' && mg.trim() ? mg.trim() : '');

        setProductLoading(false);
      } catch (e) {
        if (!cancelled) {
          setProductLoadError(e.message ?? 'Could not load item.');
          setProductLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEdit, productId, seller?.id]);

  function incrementQty() {
    setQuantity((q) => q + 1);
  }

  function decrementQty() {
    setQuantity((q) => Math.max(0, q - 1));
  }

  function clearPendingImage() {
    if (imagePreviewRevoke.current) {
      URL.revokeObjectURL(imagePreviewRevoke.current);
      imagePreviewRevoke.current = null;
    }
    setPendingPreviewUrl('');
    setPendingImage(null);
    setImageUploadPct(0);
  }

  function onProductImage(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    if (!isAcceptedImageType(file)) {
      showToast('Use JPG, PNG, or WebP.', 'error');
      return;
    }
    if (imagePreviewRevoke.current) {
      URL.revokeObjectURL(imagePreviewRevoke.current);
    }
    const url = URL.createObjectURL(file);
    imagePreviewRevoke.current = url;
    setPendingPreviewUrl(url);
    setPendingImage(file);
  }

  function buildBasePayload() {
    return {
      name,
      description,
      cuisineCategory,
      menuCategory,
      itemCategory,
      price,
      prepTime,
      quantity,
      available,
      tags: buildTags(tagFastSelling, tagSpecial),
      discountLabel,
      discountPercent,
      menuGroupId: menuGroupId.trim() ? menuGroupId.trim() : null,
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!seller?.id) return;
    setSubmitError('');
    setSubmitting(true);
    setImageUploadPct(0);
    try {
      const base = buildBasePayload();
      if (isEdit) {
        await updateProduct(productId, seller.id, base);
        if (pendingImage) {
          const blob = await compressImageToJpegBlob(pendingImage);
          const url = await uploadProductImageJpeg(
            seller.id,
            productId,
            blob,
            setImageUploadPct,
          );
          await updateProduct(productId, seller.id, { ...base, imageUrl: url });
          setExistingImageUrl(url);
          clearPendingImage();
        }
        showToast('Item saved.');
      } else {
        const newId = await createProduct(seller.id, base);
        if (pendingImage) {
          const blob = await compressImageToJpegBlob(pendingImage);
          const url = await uploadProductImageJpeg(seller.id, newId, blob, setImageUploadPct);
          await updateProduct(newId, seller.id, { ...base, imageUrl: url });
          clearPendingImage();
        }
        showToast('Item created.');
      }
      recomputeSellerSlotCount(seller.id).catch(() => {});
      setTimeout(() => navigate('/menu', { replace: true }), 450);
    } catch (err) {
      const msg = err.message ?? 'Could not save item.';
      setSubmitError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
      setImageUploadPct(0);
    }
  }

  async function handleDelete() {
    if (!seller?.id || !productId) return;
    if (
      !window.confirm(
        'Delete this item? This cannot be undone.',
      )
    ) {
      return;
    }
    setSubmitError('');
    setSubmitting(true);
    try {
      await deleteProduct(productId, seller.id);
      recomputeSellerSlotCount(seller.id).catch(() => {});
      navigate('/menu', { replace: true });
    } catch (err) {
      setSubmitError(err.message ?? 'Could not delete item.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sellerLoading) {
    return (
      <div className="add-item card">
        <p className="muted" style={{ margin: 0 }}>
          Loading…
        </p>
      </div>
    );
  }

  if (sellerError) {
    return (
      <div className="add-item card stack">
        <p className="error" style={{ margin: 0 }}>
          {sellerError.message ?? 'Could not load shop.'}
        </p>
        <Link to="/" className="btn btn-ghost">
          Home
        </Link>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="add-item card stack">
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Add item</h1>
        <p className="muted" style={{ margin: 0 }}>
          Set up your shop before adding products.
        </p>
        <Link to="/onboarding" className="btn btn-primary">
          Set up shop
        </Link>
      </div>
    );
  }

  if (isEdit && productLoading) {
    return (
      <div className="add-item card">
        <p className="muted" style={{ margin: 0 }}>
          Loading item…
        </p>
      </div>
    );
  }

  if (isEdit && productLoadError) {
    return (
      <div className="add-item card stack">
        <p className="error" style={{ margin: 0 }}>
          {productLoadError}
        </p>
        <Link to="/menu" className="btn btn-primary">
          Back to menu
        </Link>
      </div>
    );
  }

  return (
    <div className="add-item">
      <header className="add-item-header">
        <h1 style={{ margin: 0, fontSize: '1.35rem', letterSpacing: '-0.02em' }}>
          {isEdit ? 'Edit item' : 'Add custom item'}
        </h1>
      </header>

      <form className="card stack add-item-form" onSubmit={handleSubmit}>
        <div className="add-item-field">
          <label className="orders-page-wa-pref settings-page-check">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
            />
            <span>Available on menu</span>
          </label>
        </div>

        <div className="add-item-field">
          <label className="label" htmlFor="add-name">
            Name
          </label>
          <input
            id="add-name"
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="off"
          />
        </div>

        <div className="add-item-field add-item-image-row">
          <span className="label" id="add-img-label">
            Item photo
          </span>
          <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
            JPG, PNG, or WebP — compressed and uploaded after save (max ~1200px).
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            className="input"
            aria-labelledby="add-img-label"
            onChange={onProductImage}
            disabled={submitting}
          />
          {pendingPreviewUrl ? (
            <img
              className="add-item-image-preview"
              src={pendingPreviewUrl}
              alt="Selected preview"
            />
          ) : existingImageUrl ? (
            <img
              className="add-item-image-preview"
              src={existingImageUrl}
              alt="Current item"
              loading="lazy"
            />
          ) : null}
          {submitting && pendingImage ? (
            <div className="upload-progress" aria-hidden>
              <div
                className="upload-progress__bar"
                style={{ width: `${Math.max(imageUploadPct, 4)}%` }}
              />
            </div>
          ) : null}
        </div>

        <div className="add-item-field">
          <label className="label" htmlFor="add-desc">
            Description
          </label>
          <textarea
            id="add-desc"
            className="input add-item-textarea"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="add-item-field">
          <label className="label" htmlFor="add-cuisine">
            Cuisine category
          </label>
          <input
            id="add-cuisine"
            className="input"
            type="text"
            value={cuisineCategory}
            onChange={(e) => setCuisineCategory(e.target.value)}
            placeholder="e.g. North Indian"
          />
        </div>

        <div className="add-item-field">
          <label className="label" htmlFor="add-menu-cat">
            Menu category
          </label>
          <input
            id="add-menu-cat"
            className="input"
            type="text"
            value={menuCategory}
            onChange={(e) => setMenuCategory(e.target.value)}
            placeholder="e.g. Breakfast"
          />
        </div>

        <div className="add-item-field">
          <label className="label" htmlFor="add-item-cat">
            Item category
          </label>
          <input
            id="add-item-cat"
            className="input"
            type="text"
            value={itemCategory}
            onChange={(e) => setItemCategory(e.target.value)}
            placeholder="e.g. Beverages"
          />
        </div>

        <div className="add-item-field">
          <label className="label" htmlFor="add-menu-group">
            Menu group (for storefront)
          </label>
          <select
            id="add-menu-group"
            className="input"
            value={menuGroupId}
            onChange={(e) => setMenuGroupId(e.target.value)}
            aria-label="Link to menu group"
          >
            <option value="">None (not grouped)</option>
            {menuGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.menuName || g.id}
              </option>
            ))}
          </select>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem' }}>
            Create groups under <strong>Menu → Menu groups</strong>. The dashboard session (Breakfast /
            Lunch, etc.) filters by this.
          </p>
        </div>

        <div className="add-item-field">
          <label className="label" htmlFor="add-price">
            Price (₹)
          </label>
          <input
            id="add-price"
            className="input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </div>

        <div className="add-item-field">
          <label className="label" htmlFor="add-discount-label">
            Offer label (optional)
          </label>
          <input
            id="add-discount-label"
            className="input"
            type="text"
            value={discountLabel}
            onChange={(e) => setDiscountLabel(e.target.value)}
            placeholder="e.g. Flat ₹20 off · Buy 2 get 1"
          />
        </div>
        <div className="add-item-field">
          <label className="label" htmlFor="add-discount-pct">
            % off (optional)
          </label>
          <input
            id="add-discount-pct"
            className="input"
            type="number"
            min="0"
            step="0.1"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            placeholder="e.g. 10"
          />
        </div>

        <div className="add-item-field">
          <label className="label" htmlFor="add-prep">
            Preparation time
          </label>
          <input
            id="add-prep"
            className="input"
            type="text"
            value={prepTime}
            onChange={(e) => setPrepTime(e.target.value)}
            placeholder="e.g. 15 min"
          />
        </div>

        <div className="add-item-field">
          <span className="label" id="add-qty-label">
            Quantity
          </span>
          <div className="add-item-qty-row" role="group" aria-labelledby="add-qty-label">
            <button
              type="button"
              className="btn btn-ghost add-item-qty-btn"
              onClick={decrementQty}
              aria-label="Deduct quantity"
            >
              Deduct
            </button>
            <span className="add-item-qty-value" aria-live="polite">
              {quantity}
            </span>
            <button
              type="button"
              className="btn btn-ghost add-item-qty-btn"
              onClick={incrementQty}
              aria-label="Add quantity"
            >
              ADD
            </button>
          </div>
        </div>

        <fieldset className="add-item-tags">
          <legend className="label">Tags</legend>
          <label className="add-item-tag-row">
            <input
              type="checkbox"
              checked={tagFastSelling}
              onChange={(e) => setTagFastSelling(e.target.checked)}
            />
            <span>Fast Selling</span>
          </label>
          <label className="add-item-tag-row">
            <input
              type="checkbox"
              checked={tagSpecial}
              onChange={(e) => setTagSpecial(e.target.checked)}
            />
            <span>Special</span>
          </label>
          <button
            type="button"
            className="btn btn-ghost add-item-tag-more"
            disabled
            title="Coming soon"
          >
            Add more
          </button>
        </fieldset>

        {submitError ? <p className="error add-item-error">{submitError}</p> : null}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Save item'}
        </button>
      </form>

      {isEdit ? (
        <div className="add-item-danger-zone">
          <button
            type="button"
            className="btn btn-ghost add-item-delete"
            disabled={submitting}
            onClick={handleDelete}
          >
            Delete item
          </button>
        </div>
      ) : null}

      <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
        <Link to="/menu">← Back to menu</Link>
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
