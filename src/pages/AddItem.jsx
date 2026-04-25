import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isDemoExplorer } from '../constants/demoMode';
import { useSeller } from '../hooks/useSeller';
import { useSimpleToast } from '../hooks/useSimpleToast';
import {
  createProduct,
  deleteProduct,
  filterGlobalMenuCategoriesByCuisine,
  getProductForSeller,
  recomputeSellerSlotCount,
  subscribeGlobalCuisineCategories,
  subscribeGlobalMenuCategories,
  updateProduct,
} from '../services/firestore';
import { listMenuGroups, syncMenuGroupAfterProductSave } from '../services/menuGroupsService';
import {
  compressImageToJpegBlob,
  isAcceptedImageType,
  uploadProductImageJpeg,
} from '../services/storage';

function tagsFromInput(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  return [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))];
}

function productDisplayName(p) {
  const n = p?.name ?? p?.title;
  return typeof n === 'string' ? n : '';
}

export function AddItem() {
  const navigate = useNavigate();
  const { productId } = useParams();
  const isEdit = Boolean(productId);
  const demoReadOnly = isDemoExplorer();
  const { seller, loading: sellerLoading, error: sellerError } = useSeller();
  const { toast, showToast } = useSimpleToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisineCategory, setCuisineCategory] = useState('');
  const [price, setPrice] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [quantity, setQuantity] = useState(0);

  const [tagsInput, setTagsInput] = useState('');
  const [menuGroupIds, setMenuGroupIds] = useState([]);
  const [initialMenuGroupIds, setInitialMenuGroupIds] = useState([]);
  const [menuGroups, setMenuGroups] = useState([]);
  const [globalCuisines, setGlobalCuisines] = useState([]);
  const [globalMenus, setGlobalMenus] = useState([]);
  const [globalCuisinesLoad, setGlobalCuisinesLoad] = useState('loading');
  const [globalMenusLoad, setGlobalMenusLoad] = useState('loading');
  const [cuisineCategoryId, setCuisineCategoryId] = useState('');
  const [menuCategoryId, setMenuCategoryId] = useState('');
  const [legacyCuisineName, setLegacyCuisineName] = useState('');
  const [legacyMenuName, setLegacyMenuName] = useState('');
  const [editCategoriesHydrated, setEditCategoriesHydrated] = useState(false);
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
    setGlobalCuisinesLoad('loading');
    return subscribeGlobalCuisineCategories(
      (rows) => {
        setGlobalCuisines(rows);
        setGlobalCuisinesLoad('ready');
      },
      () => {
        setGlobalCuisines([]);
        setGlobalCuisinesLoad('error');
      },
    );
  }, []);

  useEffect(() => {
    setGlobalMenusLoad('loading');
    return subscribeGlobalMenuCategories(
      (rows) => {
        setGlobalMenus(rows);
        setGlobalMenusLoad('ready');
      },
      () => {
        setGlobalMenus([]);
        setGlobalMenusLoad('error');
      },
    );
  }, []);

  const activeGlobalCuisines = useMemo(
    () => globalCuisines.filter((c) => c.active !== false),
    [globalCuisines],
  );

  const selectedCuisineName = useMemo(() => {
    const row =
      activeGlobalCuisines.find((c) => c.id === cuisineCategoryId) ||
      globalCuisines.find((c) => c.id === cuisineCategoryId);
    return row?.name ? String(row.name) : '';
  }, [activeGlobalCuisines, globalCuisines, cuisineCategoryId]);

  const menuRowsForSelect = useMemo(
    () =>
      filterGlobalMenuCategoriesByCuisine(
        globalMenus,
        cuisineCategoryId,
        selectedCuisineName,
      ),
    [globalMenus, cuisineCategoryId, selectedCuisineName],
  );

  useEffect(() => {
    const allowed = new Set(menuRowsForSelect.map((m) => m.id));
    if (menuCategoryId && !allowed.has(menuCategoryId)) {
      setMenuCategoryId('');
    }
  }, [menuRowsForSelect, menuCategoryId]);

  useEffect(() => {
    if (!isEdit || !editCategoriesHydrated) return;
    if (!legacyCuisineName.trim() || cuisineCategoryId) return;
    if (!globalCuisines.length) return;
    const needle = legacyCuisineName.trim().toLowerCase();
    const match =
      activeGlobalCuisines.find((c) => c.name.toLowerCase() === needle) ||
      globalCuisines.find((c) => c.name.toLowerCase() === needle);
    if (match) setCuisineCategoryId(match.id);
  }, [isEdit, editCategoriesHydrated, legacyCuisineName, cuisineCategoryId, activeGlobalCuisines, globalCuisines]);

  useEffect(() => {
    if (!isEdit || !editCategoriesHydrated) return;
    if (!legacyMenuName.trim() || menuCategoryId) return;
    if (!globalMenus.length) return;
    const needle = legacyMenuName.trim().toLowerCase();
    const pool = filterGlobalMenuCategoriesByCuisine(
      globalMenus,
      cuisineCategoryId,
      selectedCuisineName,
    );
    const match =
      pool.find((m) => m.name.toLowerCase() === needle) ||
      globalMenus.find((m) => m.name.toLowerCase() === needle);
    if (match) setMenuCategoryId(match.id);
  }, [
    isEdit,
    editCategoriesHydrated,
    legacyMenuName,
    menuCategoryId,
    globalMenus,
    cuisineCategoryId,
    selectedCuisineName,
  ]);

  useEffect(() => {
    if (!isEdit) {
      setProductLoading(false);
      setProductLoadError(null);
      setEditCategoriesHydrated(false);
      setLegacyCuisineName('');
      setLegacyMenuName('');
      return undefined;
    }
    if (!seller?.id) {
      return undefined;
    }

    let cancelled = false;
    setProductLoading(true);
    setProductLoadError(null);
    setEditCategoriesHydrated(false);

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
        setCuisineCategoryId(String(p.cuisineCategoryId ?? '').trim());
        setMenuCategoryId(String(p.menuCategoryId ?? '').trim());
        setLegacyCuisineName(
          String(p.cuisineCategoryName ?? p.cuisineCategory ?? '').trim(),
        );
        setLegacyMenuName(String(p.menuCategoryName ?? p.menuCategory ?? '').trim());
        setPrice(
          p.price != null && Number.isFinite(Number(p.price))
            ? String(p.price)
            : '',
        );
        setPrepTime(typeof p.prepTime === 'string' ? p.prepTime : '');
        const q = Number(p.quantity);
        setQuantity(Number.isFinite(q) ? Math.max(0, Math.floor(q)) : 0);

        const tags = Array.isArray(p.tags) ? p.tags : [];
        setTagsInput(tags.length ? tags.join(', ') : '');

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

        const rawMg = p.menuGroupIds;
        let mgIds = [];
        if (Array.isArray(rawMg) && rawMg.length) {
          mgIds = [...new Set(rawMg.map((x) => String(x ?? '').trim()).filter(Boolean))];
        } else if (typeof p.menuGroupId === 'string' && p.menuGroupId.trim()) {
          mgIds = [p.menuGroupId.trim()];
        }
        setMenuGroupIds(mgIds);
        setInitialMenuGroupIds(mgIds);

        setEditCategoriesHydrated(true);
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

  function toggleMenuGroup(id) {
    const sid = String(id).trim();
    if (!sid) return;
    setMenuGroupIds((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
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
    const cRow =
      activeGlobalCuisines.find((c) => c.id === cuisineCategoryId) ||
      globalCuisines.find((c) => c.id === cuisineCategoryId);
    const menuPool = filterGlobalMenuCategoriesByCuisine(
      globalMenus,
      cuisineCategoryId,
      cRow?.name ? String(cRow.name) : '',
    );
    const mRow =
      menuPool.find((m) => m.id === menuCategoryId) ||
      globalMenus.find((m) => m.id === menuCategoryId);
    if (!cRow?.name) {
      throw new Error('Select a cuisine category from the admin list.');
    }
    if (!mRow?.name) {
      throw new Error('Select a menu category from the admin list.');
    }
    return {
      name,
      description,
      cuisineCategory: cRow.name,
      cuisineCategoryId: cRow.id,
      cuisineCategoryName: cRow.name,
      menuCategory: mRow.name,
      menuCategoryId: mRow.id,
      menuCategoryName: mRow.name,
      itemCategory: '',
      price,
      prepTime,
      quantity,
      available: true,
      tags: tagsFromInput(tagsInput),
      discountLabel,
      discountPercent,
      menuGroupIds: [...menuGroupIds],
      menuGroupId: menuGroupIds.length ? menuGroupIds[0] : null,
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
      const nextMenus = [...menuGroupIds];
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
        await syncMenuGroupAfterProductSave(seller.id, productId, nextMenus, initialMenuGroupIds);
        setInitialMenuGroupIds(nextMenus);
        showToast('Item saved.');
      } else {
        const newId = await createProduct(seller.id, base);
        if (pendingImage) {
          const blob = await compressImageToJpegBlob(pendingImage);
          const url = await uploadProductImageJpeg(seller.id, newId, blob, setImageUploadPct);
          await updateProduct(newId, seller.id, { ...base, imageUrl: url });
          clearPendingImage();
        }
        await syncMenuGroupAfterProductSave(seller.id, newId, nextMenus, []);
        setInitialMenuGroupIds(nextMenus);
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
      <fieldset className="fieldset-reset" disabled={demoReadOnly}>
      <form className="card stack add-item-form" onSubmit={handleSubmit}>
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

        <div className="add-item-field add-item-field--select">
          <label className="label" htmlFor="add-cuisine">
            Cuisine category
          </label>
          {globalCuisinesLoad === 'loading' ? (
            <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
              Loading categories…
            </p>
          ) : null}
          {globalCuisinesLoad === 'error' ? (
            <p className="error" style={{ margin: 0, fontSize: '0.875rem' }}>
              Could not load cuisine categories. Check your connection and try again.
            </p>
          ) : null}
          {globalCuisinesLoad === 'ready' && activeGlobalCuisines.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
              No categories available. Contact admin.
            </p>
          ) : null}
          <select
            id="add-cuisine"
            className="input"
            value={cuisineCategoryId}
            onChange={(e) => {
              setCuisineCategoryId(e.target.value);
              setMenuCategoryId('');
            }}
            required
            disabled={
              globalCuisinesLoad !== 'ready' || activeGlobalCuisines.length === 0
            }
          >
            <option value="">Select category</option>
            {activeGlobalCuisines.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {isEdit &&
            cuisineCategoryId &&
            !activeGlobalCuisines.some((c) => c.id === cuisineCategoryId) ? (
              <option value={cuisineCategoryId}>
                {legacyCuisineName || 'Saved cuisine'} (saved)
              </option>
            ) : null}
          </select>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem' }}>
            Admin-managed list — you can only choose from it.
          </p>
        </div>

        <div className="add-item-field add-item-field--select">
          <label className="label" htmlFor="add-menu-cat">
            Menu category
          </label>
          {globalMenusLoad === 'loading' ? (
            <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
              Loading menu categories…
            </p>
          ) : null}
          {globalMenusLoad === 'error' ? (
            <p className="error" style={{ margin: 0, fontSize: '0.875rem' }}>
              Could not load menu categories. Check your connection and try again.
            </p>
          ) : null}
          {globalMenusLoad === 'ready' &&
          globalMenus.filter((m) => m.active !== false).length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
              No menu categories available. Contact admin.
            </p>
          ) : null}
          <select
            id="add-menu-cat"
            className="input"
            value={menuCategoryId}
            onChange={(e) => setMenuCategoryId(e.target.value)}
            required
            disabled={globalMenusLoad !== 'ready' || menuRowsForSelect.length === 0}
          >
            <option value="">Select menu category</option>
            {menuRowsForSelect.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            {isEdit &&
            menuCategoryId &&
            !menuRowsForSelect.some((m) => m.id === menuCategoryId) ? (
              <option value={menuCategoryId}>
                {legacyMenuName || 'Saved menu category'} (saved)
              </option>
            ) : null}
          </select>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem' }}>
            Options follow your cuisine when the admin has linked them; otherwise all active menu
            categories are shown.
          </p>
        </div>

        <div className="add-item-field">
          <span className="label" id="add-menu-groups-label">
            Menu assignment
          </span>
          {menuGroups.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
              Create menus under <Link to="/menu?tab=menus">Menu → Menus</Link>, then assign this item.
            </p>
          ) : (
            <ul className="add-item-menu-pick stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: '0.35rem' }} aria-labelledby="add-menu-groups-label">
              {menuGroups.map((g) => (
                <li key={g.id}>
                  <label className="orders-page-wa-pref settings-page-check" style={{ gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={menuGroupIds.includes(g.id)}
                      onChange={() => toggleMenuGroup(g.id)}
                    />
                    <span>{g.name || g.menuName || g.id}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
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

        <div className="add-item-field">
          <label className="label" htmlFor="add-tags">
            Tags (optional)
          </label>
          <input
            id="add-tags"
            className="input"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Comma-separated, e.g. spicy, bestseller"
            autoComplete="off"
          />
        </div>

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
            disabled={submitting || demoReadOnly}
            onClick={handleDelete}
          >
            Delete item
          </button>
        </div>
      ) : null}
      </fieldset>

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
