/**
 * Combo thumbnail collage — same markup/CSS for seller admin, in-app preview, and (when copied) buyer storefront.
 * Three images: one tall tile (left ~50%) + two stacked (right).
 */

/** Pull a product document id from Firestore array entries (string, number, ref, legacy shapes). */
function comboProductIdFromEntry(x) {
  if (x == null) return '';
  if (typeof x === 'string') {
    const s = x.trim();
    return s;
  }
  if (typeof x === 'number' && Number.isFinite(x)) {
    return String(x);
  }
  if (typeof x === 'object') {
    if (typeof x.id === 'string' && x.id.trim()) {
      return x.id.trim();
    }
    if (typeof x.path === 'string' && x.path.includes('/')) {
      const parts = x.path.split('/').filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
  }
  const s = String(x).trim();
  if (s && !s.startsWith('[object ')) return s;
  return '';
}

/** Firestore may store `productIds`, legacy `itemIds` / `items`, strings, or DocumentReference-like objects. */
export function normalizeComboProductIds(combo) {
  const raw = combo?.productIds ?? combo?.itemIds ?? combo?.items ?? combo?.productRefs;
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const x of raw) {
    const id = comboProductIdFromEntry(x);
    if (id) out.push(id);
  }
  return [...new Set(out)];
}

function productImageUrl(p) {
  if (typeof p?.imageUrl === 'string' && p.imageUrl.trim()) return p.imageUrl.trim();
  if (typeof p?.image === 'string' && p.image.trim()) return p.image.trim();
  return '';
}

export function comboStripeUrls(combo) {
  const out = [];
  if (combo && Array.isArray(combo.imageUrls)) {
    for (const u of combo.imageUrls) {
      const s = String(u ?? '').trim();
      if (s && !out.includes(s)) out.push(s);
    }
  }
  const main = typeof combo?.imageUrl === 'string' && combo.imageUrl.trim() ? combo.imageUrl.trim() : '';
  if (main && !out.includes(main)) out.unshift(main);
  return out;
}

/**
 * Up to 4 preview URLs.
 * @param {{ fillFromProducts?: boolean }} [opts] If `fillFromProducts` is false, only stored combo `imageUrl` / `imageUrls`.
 */
export function comboCardPreviewUrls(combo, productIds, productsById, opts = {}) {
  const fillFromProducts = opts.fillFromProducts !== false;
  const stripe = comboStripeUrls(combo);
  if (stripe.length > 0) {
    return stripe.slice(0, 4);
  }
  if (!fillFromProducts) {
    return [];
  }
  const urls = [];
  const ids = Array.isArray(productIds) ? productIds : [];
  for (const id of ids) {
    if (urls.length >= 4) break;
    const u = productImageUrl(productsById.get(id));
    if (u && !urls.includes(u)) urls.push(u);
  }
  return urls;
}

/**
 * @param {object} props
 * @param {object} props.combo
 * @param {string[]} props.productIds
 * @param {Map<string, object>} props.productsById
 * @param {string} [props.className] extra class on root collage div
 * @param {boolean} [props.fillFromProducts] default true; false = stored combo images only
 */
export function ComboCollageMedia({ combo, productIds, productsById, className = '', fillFromProducts = true }) {
  const urls = comboCardPreviewUrls(combo, productIds, productsById, { fillFromProducts });
  if (urls.length === 0) {
    return <span className="menu-item-card-placeholder">No image</span>;
  }
  if (urls.length === 1) {
    return (
      <img
        className="menu-combo-collage__single"
        src={urls[0]}
        alt=""
        loading="lazy"
      />
    );
  }
  const cls =
    urls.length >= 4
      ? 'menu-combo-collage menu-combo-collage--4'
      : urls.length >= 3
        ? 'menu-combo-collage menu-combo-collage--3'
        : 'menu-combo-collage menu-combo-collage--2';
  const extra = className.trim();
  return (
    <div className={extra ? `${cls} ${extra}` : cls} aria-hidden>
      {urls.slice(0, 4).map((src, i) => (
        <img key={i} src={src} alt="" loading="lazy" />
      ))}
    </div>
  );
}
