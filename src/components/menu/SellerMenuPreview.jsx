import { useMemo, useState } from 'react';
import { getProductMenuCategoryLabel } from '../../services/firestore';
import { formatMenuCardSchedule } from '../../utils/menuSchedule';
import { ComboCollageMedia, normalizeComboProductIds } from './ComboCollageMedia';

function productName(p) {
  const n = p?.name ?? p?.title;
  return typeof n === 'string' && n.trim() ? n.trim() : 'Untitled';
}

function comboTitle(c) {
  const n = c?.name ?? c?.title;
  return typeof n === 'string' && n.trim() ? n.trim() : 'Untitled combo';
}

function productPrice(p) {
  const v = p.price ?? p.amount;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function comboPrice(c) {
  const v = c?.price ?? c?.amount;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatPrice(n) {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function productImageUrl(p) {
  if (typeof p?.imageUrl === 'string' && p.imageUrl.trim()) return p.imageUrl.trim();
  if (typeof p?.image === 'string' && p.image.trim()) return p.image.trim();
  return '';
}

function productBelongsToMenuGroup(p, groupId) {
  const gid = String(groupId ?? '').trim();
  if (!gid || !p?.id) return false;
  if (String(p.menuGroupId ?? '') === gid) return true;
  const arr = p.menuGroupIds;
  if (Array.isArray(arr) && arr.some((x) => String(x ?? '').trim() === gid)) return true;
  return false;
}

function pickItemIdsForMenu(group, products) {
  const ids = new Set();
  for (const p of products) {
    if (productBelongsToMenuGroup(p, group.id)) ids.add(p.id);
  }
  const fromDoc = group.productIds ?? group.itemIds;
  if (Array.isArray(fromDoc)) {
    for (const x of fromDoc) {
      const id = String(x ?? '').trim();
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * @param {object} props
 * @param {object} props.menuGroup
 * @param {object[]} props.products
 * @param {object[]} props.combos
 * @param {() => void} props.onClose
 * @param {string} [props.sessionBanner] optional notice (e.g. manual menu session)
 */
export function SellerMenuPreview({ menuGroup, products = [], combos = [], onClose, sessionBanner = '' }) {
  const [q, setQ] = useState('');
  const [pill, setPill] = useState('');

  const productsById = useMemo(() => {
    const m = new Map();
    for (const p of products) {
      if (p?.id) m.set(p.id, p);
    }
    return m;
  }, [products]);

  const comboIds = useMemo(
    () => new Set(Array.isArray(menuGroup?.comboIds) ? menuGroup.comboIds.map((x) => String(x)) : []),
    [menuGroup],
  );

  const combosInMenu = useMemo(
    () => combos.filter((c) => c?.id && comboIds.has(String(c.id))),
    [combos, comboIds],
  );

  const itemIds = useMemo(() => pickItemIdsForMenu(menuGroup, products), [menuGroup, products]);

  const itemsInMenu = useMemo(
    () => products.filter((p) => itemIds.has(p.id)),
    [products, itemIds],
  );

  const categories = useMemo(() => {
    const set = new Set();
    for (const p of itemsInMenu) {
      set.add(getProductMenuCategoryLabel(p));
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [itemsInMenu]);

  const needle = q.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    return itemsInMenu.filter((p) => {
      if (pill && getProductMenuCategoryLabel(p) !== pill) return false;
      if (!needle) return true;
      if (productName(p).toLowerCase().includes(needle)) return true;
      return getProductMenuCategoryLabel(p).toLowerCase().includes(needle);
    });
  }, [itemsInMenu, pill, needle]);

  const byCategory = useMemo(() => {
    const m = new Map();
    for (const p of filteredItems) {
      const c = getProductMenuCategoryLabel(p);
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(p);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) =>
        productName(a).localeCompare(productName(b), undefined, { sensitivity: 'base' }),
      );
    }
    return m;
  }, [filteredItems]);

  const categoryKeys = useMemo(() => {
    const keys = [...byCategory.keys()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    return keys;
  }, [byCategory]);

  const menuTitle = String(menuGroup?.name || menuGroup?.menuName || 'Menu').trim() || 'Menu';
  const scheduleLine = formatMenuCardSchedule(menuGroup);

  return (
    <div className="seller-menu-preview-overlay" role="presentation">
      <button
        type="button"
        className="seller-menu-preview-backdrop"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div className="seller-menu-preview card" role="dialog" aria-modal="true" aria-label="Menu preview">
        <header className="seller-menu-preview__head">
          <div>
            <h2 className="seller-menu-preview__title">{menuTitle}</h2>
            <p className="seller-menu-preview__sub muted">{scheduleLine}</p>
            {sessionBanner ? (
              <p className="seller-menu-preview__session-banner muted" style={{ margin: '0.35rem 0 0', fontSize: '0.75rem' }}>
                {sessionBanner}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn btn-ghost btn--sm" onClick={onClose}>
            Close
          </button>
        </header>

        {combosInMenu.length > 0 ? (
          <section className="seller-menu-preview__combos" aria-label="Combos">
            <p className="seller-menu-preview__eyebrow muted">Combos</p>
            <div className="seller-menu-preview__combo-scroll">
              {combosInMenu.map((c) => {
                const ids = normalizeComboProductIds(c);
                const pr = comboPrice(c);
                return (
                  <article key={c.id} className="seller-menu-preview__combo-card">
                    <div className="seller-menu-preview__combo-media seller-menu-preview__combo-media--collage">
                      <ComboCollageMedia combo={c} productIds={ids} productsById={productsById} />
                    </div>
                    <p className="seller-menu-preview__combo-name">{comboTitle(c)}</p>
                    <p className="seller-menu-preview__combo-price">{formatPrice(pr)}</p>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="seller-menu-preview__sticky">
          <input
            className="input seller-menu-preview__search"
            type="search"
            placeholder="Search items…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          <div className="seller-menu-preview__pills" role="tablist" aria-label="Categories">
            <button
              type="button"
              role="tab"
              aria-selected={pill === ''}
              className={`seller-menu-preview__pill${pill === '' ? ' seller-menu-preview__pill--on' : ''}`}
              onClick={() => setPill('')}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={pill === cat}
                className={`seller-menu-preview__pill${pill === cat ? ' seller-menu-preview__pill--on' : ''}`}
                onClick={() => setPill(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="seller-menu-preview__body">
          {categoryKeys.length === 0 ? (
            <p className="muted" style={{ margin: '1rem 0' }}>
              No items in this menu.
            </p>
          ) : (
            categoryKeys.map((cat) => {
              const items = byCategory.get(cat) || [];
              if (items.length === 0) return null;
              return (
                <section key={cat} className="seller-menu-preview__block">
                  <h3 className="seller-menu-preview__cat">{cat}</h3>
                  <ul className="seller-menu-preview__items">
                    {items.map((p) => {
                      const img = productImageUrl(p);
                      const pr = productPrice(p);
                      return (
                        <li key={p.id} className="seller-menu-preview__item">
                          <div className="seller-menu-preview__item-media">
                            {img ? <img src={img} alt="" loading="lazy" /> : <span className="muted">—</span>}
                          </div>
                          <div className="seller-menu-preview__item-body">
                            <p className="seller-menu-preview__item-name">{productName(p)}</p>
                            <p className="seller-menu-preview__item-price">{formatPrice(pr)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
