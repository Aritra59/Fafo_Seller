import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isDemoExplorer } from '../constants/demoMode';
import { useSeller } from '../hooks/useSeller';
import {
  createCombo,
  getCuisineCategoryLabel,
  recomputeSellerSlotCount,
  subscribeCombosBySellerId,
  subscribeProductsBySellerId,
  updateComboForSeller,
  updateSellerDocument,
  UNCATEGORIZED_CUISINE,
} from '../services/firestore';
import {
  compressImageToJpegBlob,
  isAcceptedImageType,
  uploadComboImageJpeg,
} from '../services/storage';

const TABS = [
  { id: 'items', label: 'Items' },
  { id: 'combos', label: 'Combos' },
  { id: 'menu', label: 'Menu' },
];

function normalizeTags(raw) {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function productName(p) {
  const n = p.name ?? p.title;
  return typeof n === 'string' && n.trim() ? n.trim() : 'Untitled';
}

function productPrice(p) {
  const v = p.price ?? p.amount;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatPrice(n) {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function comboTitle(c) {
  const n = c?.name ?? c?.title;
  return typeof n === 'string' && n.trim() ? n.trim() : 'Untitled combo';
}

function comboPriceValue(c) {
  const v = c?.price ?? c?.amount;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function discountLine(p) {
  const label = typeof p.discountLabel === 'string' && p.discountLabel.trim() ? p.discountLabel.trim() : '';
  const pct = Number(p.discountPercent);
  const pctOk = Number.isFinite(pct) && pct > 0;
  if (label && pctOk) return `${label} · ${pct}% off`;
  if (label) return label;
  if (pctOk) return `${pct}% off`;
  return '';
}

function comboDiscountLine(c) {
  const label = typeof c.discountLabel === 'string' && c.discountLabel.trim() ? c.discountLabel.trim() : '';
  const pct = Number(c.discountPercent);
  const pctOk = Number.isFinite(pct) && pct > 0;
  if (label && pctOk) return `${label} · ${pct}% off`;
  if (label) return label;
  if (pctOk) return `${pct}% off`;
  return '';
}

function matchesSearch(p, q) {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  if (productName(p).toLowerCase().includes(needle)) return true;
  return normalizeTags(p.tags).some((t) => t.toLowerCase().includes(needle));
}

/** Group by `cuisineCategory`; uncategorized last; items sorted by name within each group. */
function groupProductsByCuisine(products) {
  const map = new Map();
  for (const p of products) {
    const label = getCuisineCategoryLabel(p);
    if (!map.has(label)) {
      map.set(label, []);
    }
    map.get(label).push(p);
  }

  const sections = [];
  for (const [label, items] of map) {
    const sorted = [...items].sort((a, b) =>
      productName(a).localeCompare(productName(b), undefined, {
        sensitivity: 'base',
      }),
    );
    sections.push({ key: label, label, items: sorted });
  }

  sections.sort((a, b) => {
    if (a.label === UNCATEGORIZED_CUISINE && b.label !== UNCATEGORIZED_CUISINE) {
      return 1;
    }
    if (b.label === UNCATEGORIZED_CUISINE && a.label !== UNCATEGORIZED_CUISINE) {
      return -1;
    }
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });

  return sections;
}

export function Menu() {
  const { seller, loading: sellerLoading, error: sellerError } = useSeller();
  const [tab, setTab] = useState('items');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);
  const [combos, setCombos] = useState([]);
  const [combosLoading, setCombosLoading] = useState(true);
  const [combosError, setCombosError] = useState(null);
  const [comboName, setComboName] = useState('');
  const [comboPrice, setComboPrice] = useState('');
  const [comboDiscountLabel, setComboDiscountLabel] = useState('');
  const [comboDiscountPercent, setComboDiscountPercent] = useState('');
  const [comboSelectedIds, setComboSelectedIds] = useState([]);
  const [comboImageFile, setComboImageFile] = useState(null);
  const [comboBusy, setComboBusy] = useState(false);
  const [comboMsg, setComboMsg] = useState('');
  const demoReadOnly = isDemoExplorer();

  useEffect(() => {
    if (!seller?.id) {
      setProducts([]);
      setProductsLoading(false);
      setProductsError(null);
      return undefined;
    }

    setProductsLoading(true);
    setProductsError(null);

    const unsub = subscribeProductsBySellerId(
      seller.id,
      (rows) => {
        setProducts(rows);
        setProductsLoading(false);
        setProductsError(null);
      },
      (err) => {
        setProductsError(err);
        setProducts([]);
        setProductsLoading(false);
      },
    );

    return () => unsub();
  }, [seller?.id]);

  useEffect(() => {
    if (!seller?.id) {
      setCombos([]);
      setCombosLoading(false);
      setCombosError(null);
      return undefined;
    }
    setCombosLoading(true);
    setCombosError(null);
    const unsub = subscribeCombosBySellerId(
      seller.id,
      (rows) => {
        setCombos(rows);
        setCombosLoading(false);
        setCombosError(null);
      },
      (err) => {
        setCombosError(err);
        setCombos([]);
        setCombosLoading(false);
      },
    );
    return () => unsub();
  }, [seller?.id]);

  const productsById = useMemo(() => {
    const m = new Map();
    for (const p of products) {
      m.set(p.id, p);
    }
    return m;
  }, [products]);

  const filtered = useMemo(
    () => products.filter((p) => matchesSearch(p, search)),
    [products, search],
  );

  const groupedByCuisine = useMemo(
    () => groupProductsByCuisine(filtered),
    [filtered],
  );

  function toggleComboProduct(id) {
    setComboSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleCreateCombo(e) {
    e.preventDefault();
    if (!seller?.id || demoReadOnly) return;
    setComboMsg('');
    setComboBusy(true);
    try {
      const name = comboName.trim();
      const price = Number(comboPrice);
      if (!name) throw new Error('Combo name is required.');
      if (!Number.isFinite(price) || price < 0) throw new Error('Enter a valid combo price.');
      if (comboSelectedIds.length === 0) {
        throw new Error('Select at least one product for this combo.');
      }
      const fields = {
        name,
        price,
        productIds: comboSelectedIds,
      };
      if (comboDiscountLabel.trim()) {
        fields.discountLabel = comboDiscountLabel.trim();
      }
      const dPctRaw = comboDiscountPercent.trim();
      if (dPctRaw !== '') {
        const dPct = Number(dPctRaw);
        if (!Number.isFinite(dPct) || dPct < 0) {
          throw new Error('Enter a valid discount percent.');
        }
        fields.discountPercent = dPct;
      }
      const newId = await createCombo(seller.id, fields);
      if (comboImageFile) {
        const blob = await compressImageToJpegBlob(comboImageFile);
        const url = await uploadComboImageJpeg(seller.id, newId, blob);
        await updateComboForSeller(newId, seller.id, { imageUrl: url });
      }
      setComboName('');
      setComboPrice('');
      setComboDiscountLabel('');
      setComboDiscountPercent('');
      setComboSelectedIds([]);
      setComboImageFile(null);
      setComboMsg('Combo saved.');
      recomputeSellerSlotCount(seller.id).catch(() => {});
    } catch (err) {
      setComboMsg(err.message ?? 'Could not save combo.');
    } finally {
      setComboBusy(false);
    }
  }

  function onComboImagePick(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    if (!isAcceptedImageType(file)) {
      setComboMsg('Use JPG, PNG, or WebP for combo image.');
      return;
    }
    setComboImageFile(file);
    setComboMsg('');
  }

  function handleAddFromMaster() {
    window.alert('Browse master catalog — coming soon.');
  }

  async function toggleMenuLayout(key) {
    if (!seller?.id || demoReadOnly) return;
    const cur = seller.menuLayouts && typeof seller.menuLayouts === 'object' ? seller.menuLayouts : {};
    const nextVal = cur[key] !== true;
    const next = { ...cur, [key]: nextVal };
    try {
      await updateSellerDocument(seller.id, { menuLayouts: next });
      await recomputeSellerSlotCount(seller.id);
    } catch (e) {
      setComboMsg(e.message ?? 'Could not update menus.');
    }
  }

  const globalDiscountText =
    typeof seller?.globalDiscountText === 'string' && seller.globalDiscountText.trim()
      ? seller.globalDiscountText.trim()
      : '';
  const gPct = Number(seller?.globalDiscountPercent);
  const globalDiscountPct = Number.isFinite(gPct) && gPct > 0 ? gPct : null;

  if (sellerLoading) {
    return (
      <div className="menu-page card">
        <p className="muted" style={{ margin: 0 }}>
          Loading…
        </p>
      </div>
    );
  }

  if (sellerError) {
    return (
      <div className="menu-page card stack">
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
      <div className="menu-page card stack">
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Menu</h1>
        <p className="muted" style={{ margin: 0 }}>
          Set up your shop to manage items.
        </p>
        <Link to="/onboarding" className="btn btn-primary">
          Set up shop
        </Link>
      </div>
    );
  }

  return (
    <div className="menu-page">
      <header className="menu-page-header">
        <h1 style={{ margin: 0, fontSize: '1.35rem', letterSpacing: '-0.02em' }}>
          Menu
        </h1>
      </header>

      <div className="menu-page-search-row">
        <label className="menu-page-search-wrap" htmlFor="menu-search">
          <span className="sr-only">Search items</span>
          <svg
            className="menu-page-search-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            id="menu-search"
            className="input menu-page-search-input"
            type="search"
            placeholder="Search name or tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className="menu-page-mic"
          aria-label="Voice search (coming soon)"
          title="Voice search — coming soon"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
      </div>

      <div className="menu-page-tabs" role="tablist" aria-label="Menu sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`menu-page-tab${tab === t.id ? ' menu-page-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {globalDiscountText || globalDiscountPct != null ? (
        <div className="menu-global-offer card" role="region" aria-label="Shop-wide offer">
          <p className="menu-global-offer-title" style={{ margin: 0, fontWeight: 700 }}>
            Shop offer
          </p>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.9375rem' }}>
            {globalDiscountText ? <span>{globalDiscountText}</span> : null}
            {globalDiscountText && globalDiscountPct != null ? <span> · </span> : null}
            {globalDiscountPct != null ? (
              <span>{globalDiscountPct}% off eligible items</span>
            ) : null}
          </p>
        </div>
      ) : null}

      {tab === 'items' ? (
        <>
          <div className="menu-page-actions">
            <button type="button" className="btn btn-ghost" onClick={handleAddFromMaster}>
              Add from master list
            </button>
            <Link to="/menu/add" className="btn btn-primary">
              Add custom item
            </Link>
          </div>

          {productsError ? (
            <p className="error menu-page-products-error" style={{ margin: 0 }}>
              {productsError.message ?? 'Could not load products.'}
            </p>
          ) : null}

          {productsLoading ? (
            <p className="muted" style={{ margin: 0 }}>
              Loading items…
            </p>
          ) : filtered.length === 0 ? (
            <div className="card menu-page-empty">
              <p className="muted" style={{ margin: 0 }}>
                {search.trim()
                  ? 'No items match your search.'
                  : 'No products yet. Add items in Firestore or use the buttons above.'}
              </p>
            </div>
          ) : (
            <div className="menu-page-grouped">
              {groupedByCuisine.map((section) => (
                <section
                  key={section.key}
                  className="menu-page-cuisine-block"
                  aria-label={`Cuisine: ${section.label}`}
                >
                  <h2 className="menu-page-cuisine-heading">
                    <span className="menu-page-cuisine-prefix">Cuisine category:</span>
                    <span className="menu-page-cuisine-name">{section.label}</span>
                  </h2>
                  <ul className="menu-page-list">
                    {section.items.map((p) => {
                      const tags = normalizeTags(p.tags);
                      const price = productPrice(p);
                      const img =
                        typeof p.imageUrl === 'string' && p.imageUrl.trim()
                          ? p.imageUrl.trim()
                          : typeof p.image === 'string' && p.image.trim()
                            ? p.image.trim()
                            : '';

                      return (
                        <li key={p.id}>
                          <article className="menu-item-card card">
                            <div
                              className="menu-item-card-media"
                              aria-hidden={img ? undefined : true}
                            >
                              {img ? (
                                <img src={img} alt="" loading="lazy" />
                              ) : (
                                <span className="menu-item-card-placeholder">No image</span>
                              )}
                            </div>
                            <div className="menu-item-card-body">
                              <div className="menu-item-card-top">
                                <h3 className="menu-item-card-name">{productName(p)}</h3>
                                <p className="menu-item-card-price">{formatPrice(price)}</p>
                              </div>
                              {discountLine(p) ? (
                                <p className="menu-item-card-discount" style={{ margin: '0.25rem 0 0' }}>
                                  {discountLine(p)}
                                </p>
                              ) : null}
                              {tags.length > 0 ? (
                                <ul className="menu-item-card-tags">
                                  {tags.map((tag, i) => (
                                    <li key={`${tag}-${i}`}>{tag}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p
                                  className="muted menu-item-card-no-tags"
                                  style={{ margin: 0 }}
                                >
                                  No tags
                                </p>
                              )}
                              <Link
                                to={`/menu/edit/${p.id}`}
                                className="btn btn-ghost menu-item-card-edit"
                              >
                                Edit
                              </Link>
                            </div>
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      ) : null}

      {tab === 'combos' ? (
        <div className="menu-combos-wrap stack">
          {demoReadOnly ? (
            <p className="muted card" style={{ margin: 0 }}>
              Demo mode is read-only. Sign in to create combos in Firestore.
            </p>
          ) : (
            <form className="card stack menu-combo-form" onSubmit={handleCreateCombo}>
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>New combo</h2>
              <label className="menu-combo-field">
                <span className="label">Combo name</span>
                <input
                  className="input"
                  value={comboName}
                  onChange={(ev) => setComboName(ev.target.value)}
                  required
                />
              </label>
              <label className="menu-combo-field">
                <span className="label">Combo price (₹)</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={comboPrice}
                  onChange={(ev) => setComboPrice(ev.target.value)}
                  required
                />
              </label>
              <div className="menu-combo-field">
                <span className="label">Includes (select products)</span>
                <ul className="menu-combo-pick-list">
                  {products.map((p) => (
                    <li key={p.id}>
                      <label className="menu-combo-pick-row">
                        <input
                          type="checkbox"
                          checked={comboSelectedIds.includes(p.id)}
                          onChange={() => toggleComboProduct(p.id)}
                        />
                        <span>{productName(p)}</span>
                        <span className="muted">{formatPrice(productPrice(p))}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <label className="menu-combo-field">
                <span className="label">Combo offer label (optional)</span>
                <input
                  className="input"
                  value={comboDiscountLabel}
                  onChange={(ev) => setComboDiscountLabel(ev.target.value)}
                  placeholder="e.g. Buy 2 get 1 · Today only"
                />
              </label>
              <label className="menu-combo-field">
                <span className="label">Combo % off (optional)</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.1"
                  value={comboDiscountPercent}
                  onChange={(ev) => setComboDiscountPercent(ev.target.value)}
                  placeholder="e.g. 10"
                />
              </label>
              <label className="menu-combo-field">
                <span className="label">Combo image (optional)</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onComboImagePick} />
                {comboImageFile ? (
                  <span className="muted" style={{ fontSize: '0.8125rem' }}>
                    {comboImageFile.name}
                  </span>
                ) : null}
              </label>
              {comboMsg ? (
                <p className={comboMsg.startsWith('Combo saved') ? 'muted' : 'error'} style={{ margin: 0 }}>
                  {comboMsg}
                </p>
              ) : null}
              <button type="submit" className="btn btn-primary" disabled={comboBusy}>
                {comboBusy ? 'Saving…' : 'Save combo'}
              </button>
            </form>
          )}

          <section className="card" aria-labelledby="menu-combo-list-title">
            <h2 id="menu-combo-list-title" style={{ margin: 0, fontSize: '1.05rem' }}>
              Your combos
            </h2>
            {combosError ? (
              <p className="error" style={{ margin: '0.75rem 0 0' }}>
                {combosError.message ?? 'Could not load combos.'}
              </p>
            ) : null}
            {combosLoading ? (
              <p className="muted" style={{ margin: '0.75rem 0 0' }}>
                Loading combos…
              </p>
            ) : combos.length === 0 ? (
              <p className="muted" style={{ margin: '0.75rem 0 0' }}>
                No combos yet.
              </p>
            ) : (
              <ul className="menu-combo-list">
                {combos.map((c) => {
                  const ids = Array.isArray(c.productIds) ? c.productIds : [];
                  const includes = ids
                    .map((id) => productsById.get(id))
                    .filter(Boolean)
                    .map((p) => productName(p));
                  const img =
                    typeof c.imageUrl === 'string' && c.imageUrl.trim() ? c.imageUrl.trim() : '';
                  const dLine = comboDiscountLine(c);
                  return (
                    <li key={c.id}>
                      <article className="menu-combo-card">
                        <div className="menu-combo-card-media">
                          {img ? (
                            <img src={img} alt="" loading="lazy" />
                          ) : (
                            <span className="muted">No image</span>
                          )}
                        </div>
                        <div className="menu-combo-card-body">
                          <h3 style={{ margin: 0, fontSize: '1rem' }}>{comboTitle(c)}</h3>
                          <p className="menu-item-card-price" style={{ margin: '0.25rem 0' }}>
                            {formatPrice(comboPriceValue(c))}
                          </p>
                          {dLine ? (
                            <p className="menu-item-card-discount" style={{ margin: '0 0 0.35rem' }}>
                              {dLine}
                            </p>
                          ) : null}
                          <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
                            Includes:{' '}
                            {includes.length ? includes.join(', ') : ids.join(', ') || '—'}
                          </p>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'menu' ? (
        <div className="menu-full-preview stack">
          <section className="card stack" aria-label="Menu sections">
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Menu sections</h2>
            <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
              Enable Breakfast / Lunch / Dinner for slot counts and buyer layout. Names should
              match your product &quot;Menu category&quot; where possible.
            </p>
            <div className="stack" style={{ gap: '0.5rem' }}>
              {['breakfast', 'lunch', 'dinner'].map((key) => {
                const cur =
                  seller.menuLayouts && typeof seller.menuLayouts === 'object'
                    ? seller.menuLayouts
                    : {};
                const on = cur[key] !== false;
                return (
                  <label key={key} className="orders-page-wa-pref settings-page-check">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={demoReadOnly}
                      onChange={() => toggleMenuLayout(key)}
                    />
                    <span style={{ textTransform: 'capitalize' }}>{key}</span>
                  </label>
                );
              })}
            </div>
          </section>
          {globalDiscountText || globalDiscountPct != null ? (
            <div className="menu-full-hero card">
              <p style={{ margin: 0, fontWeight: 700 }}>Today at {seller.shopName ?? 'your shop'}</p>
              <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                {globalDiscountText}
                {globalDiscountPct != null ? ` · Up to ${globalDiscountPct}% off` : null}
              </p>
            </div>
          ) : null}
          {productsLoading ? (
            <p className="muted" style={{ margin: 0 }}>
              Loading menu…
            </p>
          ) : (
            <>
              {groupedByCuisine.map((section) => (
                <section key={section.key} className="card menu-full-section" aria-label={section.label}>
                  <h2 className="menu-page-cuisine-heading">
                    <span className="menu-page-cuisine-name">{section.label}</span>
                  </h2>
                  <ul className="menu-full-lines">
                    {section.items.map((p) => {
                      const price = productPrice(p);
                      const d = discountLine(p);
                      return (
                        <li key={p.id} className="menu-full-line">
                          <span className="menu-full-line-name">{productName(p)}</span>
                          <span className="menu-full-line-dots" aria-hidden />
                          <span className="menu-full-line-price">{formatPrice(price)}</span>
                          {d ? (
                            <span className="menu-full-line-disc muted">{d}</span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              {combos.length > 0 ? (
                <section className="card menu-full-section" aria-label="Combos">
                  <h2 className="menu-page-cuisine-heading">
                    <span className="menu-page-cuisine-name">Combos</span>
                  </h2>
                  <ul className="menu-full-lines">
                    {combos.map((c) => (
                      <li key={c.id} className="menu-full-line menu-full-line--combo">
                        <span className="menu-full-line-name">{comboTitle(c)}</span>
                        <span className="menu-full-line-dots" aria-hidden />
                        <span className="menu-full-line-price">{formatPrice(comboPriceValue(c))}</span>
                        {comboDiscountLine(c) ? (
                          <span className="menu-full-line-disc muted">{comboDiscountLine(c)}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <p className="muted" style={{ margin: 0, fontSize: '0.8125rem' }}>
        <Link to="/dashboard">← Back to dashboard</Link>
      </p>
    </div>
  );
}
