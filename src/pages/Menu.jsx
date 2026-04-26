import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { isDemoExplorer } from '../constants/demoMode';
import { useRegisterPageTitleSuffix } from '../context/SellerPageTitleContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useSeller } from '../hooks/useSeller';
import {
  createCombo,
  deleteComboForSeller,
  deleteProduct,
  getCuisineCategoryLabel,
  getProductMenuCategoryLabel,
  recomputeSellerSlotCount,
  subscribeCombosBySellerId,
  subscribeGlobalCuisineCategories,
  subscribeGlobalMenuCategories,
  subscribeProductsBySellerId,
  updateComboForSeller,
  UNCATEGORIZED_CUISINE,
  UNCATEGORIZED_MENU,
} from '../services/firestore';
import {
  removeComboFromSellerMenus,
  subscribeMenuGroupsBySellerId,
} from '../services/menuGroupsService';
import { normalizeShopCode } from '../utils/shopCode';
import { publicShopByCodeUrl } from '../utils/publicShopUrl';
import {
  compressImageToJpegBlob,
  isAcceptedImageType,
  uploadComboImageJpeg,
  uploadComboImageJpegAt,
} from '../services/storage';
import { MenusPanel } from '../components/menu/MenusPanel';
import {
  ComboCollageMedia,
  comboCardPreviewUrls,
  comboStripeUrls,
  normalizeComboProductIds,
} from '../components/menu/ComboCollageMedia';

const TABS = [
  { id: 'items', label: 'Items' },
  { id: 'combos', label: 'Combos' },
  { id: 'menus', label: 'Menus' },
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

function matchesComboSearch(c, q) {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return comboTitle(c).toLowerCase().includes(needle);
}

function comboPriceValue(c) {
  const v = c?.price ?? c?.amount;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function productImageUrl(p) {
  if (typeof p?.imageUrl === 'string' && p.imageUrl.trim()) return p.imageUrl.trim();
  if (typeof p?.image === 'string' && p.image.trim()) return p.image.trim();
  return '';
}

function sumIncludedItemsRetail(ids, productsById) {
  let sum = 0;
  for (const id of ids || []) {
    const p = productsById.get(String(id));
    if (!p) continue;
    const v = p.price ?? p.amount;
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

function matchesSearch(p, q) {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  if (productName(p).toLowerCase().includes(needle)) return true;
  return normalizeTags(p.tags).some((t) => t.toLowerCase().includes(needle));
}

function cuisineFilterKey(p) {
  const id = String(p.cuisineCategoryId ?? '').trim();
  if (id) return `id:${id}`;
  return `name:${getCuisineCategoryLabel(p)}`;
}

function cuisineFilterLabel(p, globalCuisines) {
  const id = String(p.cuisineCategoryId ?? '').trim();
  if (id) {
    const row = globalCuisines.find((c) => c.id === id);
    return row?.name?.trim() || getCuisineCategoryLabel(p);
  }
  return getCuisineCategoryLabel(p);
}

function menuFilterKey(p) {
  const id = String(p.menuCategoryId ?? '').trim();
  if (id) return `id:${id}`;
  return `name:${getProductMenuCategoryLabel(p)}`;
}

function menuFilterLabel(p, globalMenus) {
  const id = String(p.menuCategoryId ?? '').trim();
  if (id) {
    const row = globalMenus.find((m) => m.id === id);
    return row?.name?.trim() || getProductMenuCategoryLabel(p);
  }
  return getProductMenuCategoryLabel(p);
}

/** Cuisine → menu category → items (sorted). */
function buildProductHierarchy(productRows) {
  const byCuisine = new Map();
  for (const p of productRows) {
    const c = getCuisineCategoryLabel(p);
    const m = getProductMenuCategoryLabel(p);
    if (!byCuisine.has(c)) byCuisine.set(c, new Map());
    const byMenu = byCuisine.get(c);
    if (!byMenu.has(m)) byMenu.set(m, []);
    byMenu.get(m).push(p);
  }

  const cuisineKeys = [...byCuisine.keys()].sort((a, b) => {
    if (a === UNCATEGORIZED_CUISINE) return 1;
    if (b === UNCATEGORIZED_CUISINE) return -1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });

  return cuisineKeys.map((cuisine) => {
    const byMenu = byCuisine.get(cuisine);
    const menuKeys = [...byMenu.keys()].sort((a, b) => {
      if (a === UNCATEGORIZED_MENU) return 1;
      if (b === UNCATEGORIZED_MENU) return -1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
    return {
      cuisine,
      menuSections: menuKeys.map((menuLabel) => ({
        menuLabel,
        items: [...byMenu.get(menuLabel)].sort((a, b) =>
          productName(a).localeCompare(productName(b), undefined, { sensitivity: 'base' }),
        ),
      })),
    };
  });
}

function productInAnyMenuGroup(p, menuGroups) {
  if (p?.menuGroupId) return true;
  if (Array.isArray(p?.menuGroupIds) && p.menuGroupIds.length) return true;
  const pid = String(p?.id ?? '');
  if (!pid) return false;
  for (const g of menuGroups) {
    const raw = [...(g.productIds || []), ...(g.itemIds || [])].map((x) => String(x));
    if (raw.includes(pid)) return true;
  }
  return false;
}

function comboInAnyMenuGroup(c, menuGroups) {
  const cid = String(c?.id ?? '');
  if (!cid) return false;
  for (const g of menuGroups) {
    const raw = (g.comboIds || []).map((x) => String(x));
    if (raw.includes(cid)) return true;
  }
  return false;
}

function productBelongsToMenuGroup(p, groupId) {
  const gid = String(groupId ?? '').trim();
  if (!gid || !p?.id) return false;
  if (String(p.menuGroupId ?? '') === gid) return true;
  const arr = p.menuGroupIds;
  if (Array.isArray(arr) && arr.some((x) => String(x ?? '').trim() === gid)) return true;
  return false;
}

/** Item ids assigned to a menu (product fields + doc arrays), same idea as MenusPanel. */
function collectMenuItemIdsForGroup(group, products) {
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

function menuGroupDisplayName(g) {
  const n = g?.name ?? g?.title;
  return typeof n === 'string' && n.trim() ? n.trim() : 'Untitled menu';
}

export function Menu() {
  const { seller, loading: sellerLoading, error: sellerError } = useSeller();
  const [searchParams, setSearchParams] = useSearchParams();
  const comboEditId = searchParams.get('editCombo')?.trim() ?? '';
  const isEditingCombo = Boolean(comboEditId);
  const comboHydrateRef = useRef('');
  /** Server snapshot signature so we re-hydrate when `productIds` / price arrive after first paint. */
  const comboHydrateSigRef = useRef('');
  /** After hydrating an edit, sync flat discount from stored `price` once products are loaded. */
  const comboEditPriceDeriveDoneRef = useRef('');
  const menusPanelRef = useRef(null);
  const [tab, setTab] = useState('items');
  const [searchRaw, setSearchRaw] = useState('');
  const search = useDebouncedValue(searchRaw, 320);
  const [selectedCuisineKey, setSelectedCuisineKey] = useState('');
  const [selectedMenuKey, setSelectedMenuKey] = useState('');
  const [globalCuisines, setGlobalCuisines] = useState([]);
  const [globalMenus, setGlobalMenus] = useState([]);
  const [globalCuisinesLoad, setGlobalCuisinesLoad] = useState('loading');
  const [globalMenusLoad, setGlobalMenusLoad] = useState('loading');
  const [menuGroups, setMenuGroups] = useState([]);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(null);
  const [combos, setCombos] = useState([]);
  const [combosLoading, setCombosLoading] = useState(true);
  const [combosError, setCombosError] = useState(null);
  const [comboName, setComboName] = useState('');
  const [comboDiscountLabel, setComboDiscountLabel] = useState('');
  const [comboDiscountPercent, setComboDiscountPercent] = useState('');
  const [comboDiscountFlat, setComboDiscountFlat] = useState('');
  const [comboSelectedIds, setComboSelectedIds] = useState([]);
  const [comboImageFiles, setComboImageFiles] = useState([]);
  const [comboBusy, setComboBusy] = useState(false);
  const [comboMsg, setComboMsg] = useState('');
  const [deleteBusyId, setDeleteBusyId] = useState(null);
  const [deleteComboBusyId, setDeleteComboBusyId] = useState(null);
  const demoReadOnly = isDemoExplorer();
  const tabHeading = TABS.find((t) => t.id === tab)?.label ?? '';
  useRegisterPageTitleSuffix(tabHeading);
  const newComboOpen = searchParams.get('newCombo') === '1';
  const showComboForm = !demoReadOnly && (Boolean(comboEditId) || newComboOpen);

  const tabParam = searchParams.get('tab');
  useEffect(() => {
    if (tabParam === 'menugroups') {
      setTab('menus');
      setSearchParams({ tab: 'menus' }, { replace: true });
      return;
    }
    if (tabParam === 'categories' || tabParam === 'discounts') {
      setTab('items');
      setSearchParams({}, { replace: true });
      return;
    }
    if (tabParam && TABS.some((t) => t.id === tabParam)) {
      setTab(tabParam);
    }
  }, [tabParam, setSearchParams]);

  function goTab(next) {
    setTab(next);
    if (next === 'items') {
      setSearchParams({}, { replace: true });
      return;
    }
    const keepEdit = searchParams.get('editCombo')?.trim();
    if (next === 'combos' && keepEdit) {
      setSearchParams({ tab: 'combos', editCombo: keepEdit }, { replace: true });
      return;
    }
    setSearchParams({ tab: next }, { replace: true });
  }

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

  useEffect(() => {
    if (tab !== 'combos') {
      comboHydrateRef.current = '';
      comboHydrateSigRef.current = '';
      return;
    }
    if (!comboEditId) {
      comboHydrateRef.current = '';
      comboHydrateSigRef.current = '';
      comboEditPriceDeriveDoneRef.current = '';
      return;
    }
    if (combosLoading) {
      return;
    }
    const c = combos.find((x) => String(x.id) === String(comboEditId));
    if (!c) {
      comboHydrateRef.current = '';
      comboHydrateSigRef.current = '';
      setSearchParams({ tab: 'combos' }, { replace: true });
      setComboMsg('That combo could not be loaded.');
      return;
    }
    const idsNorm = normalizeComboProductIds(c);
    const nextSig = [
      String(comboEditId),
      idsNorm.slice().sort().join(','),
      comboTitle(c),
      String(c?.price ?? ''),
      String(c?.discountFlatAmount ?? ''),
      String(c?.discountPercent ?? ''),
      typeof c?.discountLabel === 'string' ? c.discountLabel : '',
      Array.isArray(c?.imageUrls) ? c.imageUrls.join('|') : '',
      typeof c?.imageUrl === 'string' ? c.imageUrl : '',
    ].join('§');
    if (comboHydrateRef.current === comboEditId && comboHydrateSigRef.current === nextSig) {
      return;
    }
    comboHydrateRef.current = comboEditId;
    comboHydrateSigRef.current = nextSig;
    comboEditPriceDeriveDoneRef.current = '';
    setComboName(comboTitle(c));
    setComboSelectedIds(idsNorm.map((id) => String(id)));
    const dl = c.discountLabel;
    setComboDiscountLabel(typeof dl === 'string' ? dl : '');
    const dp = c.discountPercent;
    setComboDiscountPercent(
      dp != null && Number.isFinite(Number(dp)) ? String(dp) : '',
    );
    const df = c.discountFlatAmount;
    setComboDiscountFlat(
      df != null && Number.isFinite(Number(df)) ? String(df) : '',
    );
    setComboImageFiles([]);
    setComboMsg('');
  }, [tab, comboEditId, combos, combosLoading, setSearchParams]);

  useEffect(() => {
    if (tab !== 'combos' || comboEditId || !newComboOpen) {
      return;
    }
    comboHydrateRef.current = '';
    comboHydrateSigRef.current = '';
    comboEditPriceDeriveDoneRef.current = '';
    setComboName('');
    setComboDiscountLabel('');
    setComboDiscountPercent('');
    setComboDiscountFlat('');
    setComboSelectedIds([]);
    setComboImageFiles([]);
    setComboMsg('');
  }, [tab, comboEditId, newComboOpen]);

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

  useEffect(() => {
    if (!seller?.id) {
      setMenuGroups([]);
      return undefined;
    }
    return subscribeMenuGroupsBySellerId(
      seller.id,
      (rows) => setMenuGroups(rows || []),
      () => setMenuGroups([]),
    );
  }, [seller?.id]);

  useEffect(() => {
    setSelectedMenuKey('');
  }, [selectedCuisineKey]);

  const productsById = useMemo(() => {
    const m = new Map();
    for (const p of products) {
      m.set(String(p.id), p);
    }
    return m;
  }, [products]);

  useEffect(() => {
    if (tab !== 'combos' || !comboEditId) {
      return;
    }
    if (combosLoading || productsLoading) return;
    if (comboEditPriceDeriveDoneRef.current === comboEditId) return;

    const c = combos.find((x) => x.id === comboEditId);
    if (!c) return;

    const stored = comboPriceValue(c);
    const explicitPct =
      c.discountPercent != null &&
      Number.isFinite(Number(c.discountPercent)) &&
      Number(c.discountPercent) > 0;
    const explicitFlat =
      c.discountFlatAmount != null &&
      Number.isFinite(Number(c.discountFlatAmount)) &&
      Number(c.discountFlatAmount) > 0;
    if (explicitPct || explicitFlat) {
      comboEditPriceDeriveDoneRef.current = comboEditId;
      return;
    }
    if (stored == null) {
      comboEditPriceDeriveDoneRef.current = comboEditId;
      return;
    }

    const ids = normalizeComboProductIds(c);
    if (ids.length > 0 && ids.some((id) => !productsById.has(String(id))) && productsLoading) return;

    const retail = sumIncludedItemsRetail(ids, productsById);
    if (ids.length > 0 && retail <= 0 && productsLoading) return;
    if (ids.length > 0 && retail <= 0 && !productsLoading) {
      comboEditPriceDeriveDoneRef.current = comboEditId;
      return;
    }

    comboEditPriceDeriveDoneRef.current = comboEditId;
    const flat =
      ids.length === 0 ? 0 : Math.max(0, Math.round((retail - stored) * 100) / 100);
    setComboDiscountPercent('');
    setComboDiscountFlat(String(flat));
  }, [
    tab,
    comboEditId,
    combos,
    combosLoading,
    productsLoading,
    productsById,
  ]);

  const cuisineOptionsFromCatalog = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      const k = cuisineFilterKey(p);
      const lab = cuisineFilterLabel(p, globalCuisines);
      if (!lab || lab === UNCATEGORIZED_CUISINE) continue;
      if (!map.has(k)) map.set(k, lab);
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [products, globalCuisines]);

  const cuisineFilteredProducts = useMemo(() => {
    if (!selectedCuisineKey) return products;
    return products.filter((p) => cuisineFilterKey(p) === selectedCuisineKey);
  }, [products, selectedCuisineKey]);

  const menuOptionsFromCatalog = useMemo(() => {
    const map = new Map();
    for (const p of cuisineFilteredProducts) {
      const k = menuFilterKey(p);
      const lab = menuFilterLabel(p, globalMenus);
      if (!lab || lab === UNCATEGORIZED_MENU) continue;
      if (!map.has(k)) map.set(k, lab);
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [cuisineFilteredProducts, globalMenus]);

  const filtered = useMemo(() => {
    let rows = products.filter((p) => matchesSearch(p, search));
    if (selectedCuisineKey) {
      rows = rows.filter((p) => cuisineFilterKey(p) === selectedCuisineKey);
    }
    if (selectedMenuKey) {
      rows = rows.filter((p) => menuFilterKey(p) === selectedMenuKey);
    }
    return rows;
  }, [products, search, selectedCuisineKey, selectedMenuKey]);

  const productHierarchy = useMemo(() => buildProductHierarchy(filtered), [filtered]);

  const combosMatchingCategories = useMemo(() => {
    if (!selectedCuisineKey && !selectedMenuKey) return combos;
    return combos.filter((c) => {
      const ids = normalizeComboProductIds(c);
      return ids.some((id) => {
        const p = productsById.get(String(id));
        if (!p) return false;
        if (selectedCuisineKey && cuisineFilterKey(p) !== selectedCuisineKey) return false;
        if (selectedMenuKey && menuFilterKey(p) !== selectedMenuKey) return false;
        return true;
      });
    });
  }, [combos, productsById, selectedCuisineKey, selectedMenuKey]);

  const combosFiltered = useMemo(
    () => combosMatchingCategories.filter((c) => matchesComboSearch(c, search)),
    [combosMatchingCategories, search],
  );

  const menusMatchingFilters = useMemo(() => {
    const qRaw = search.trim();
    const q = qRaw.toLowerCase();
    const hasSearch = Boolean(q);
    const hasCat = Boolean(selectedCuisineKey || selectedMenuKey);
    const catIds = new Set();
    if (hasCat) {
      for (const p of products) {
        if (selectedCuisineKey && cuisineFilterKey(p) !== selectedCuisineKey) continue;
        if (selectedMenuKey && menuFilterKey(p) !== selectedMenuKey) continue;
        catIds.add(String(p.id));
      }
    }
    const comboById = new Map(combos.map((c) => [c.id, c]));

    function comboMatchesCategory(c) {
      if (!hasCat) return true;
      const ids = normalizeComboProductIds(c);
      return ids.some((id) => catIds.has(String(id)));
    }

    return menuGroups.filter((g) => {
      const itemIds = collectMenuItemIdsForGroup(g, products);
      if (hasCat) {
        const hitItem = [...itemIds].some((id) => catIds.has(String(id)));
        const cids = Array.isArray(g.comboIds) ? g.comboIds : [];
        const hitCombo = cids.some((cid) => {
          const c = comboById.get(String(cid ?? '').trim());
          return c && comboMatchesCategory(c);
        });
        if (!hitItem && !hitCombo) return false;
      }
      if (!hasSearch) return true;
      if (menuGroupDisplayName(g).toLowerCase().includes(q)) return true;
      for (const id of itemIds) {
        const p = productsById.get(String(id));
        if (p && matchesSearch(p, qRaw)) return true;
      }
      const cids = Array.isArray(g.comboIds) ? g.comboIds : [];
      for (const cid of cids) {
        const c = comboById.get(String(cid ?? '').trim());
        if (c && matchesComboSearch(c, qRaw)) return true;
      }
      return false;
    });
  }, [
    menuGroups,
    products,
    combos,
    productsById,
    search,
    selectedCuisineKey,
    selectedMenuKey,
  ]);

  const filterBarActive = Boolean(selectedCuisineKey || selectedMenuKey || search.trim());

  const allowedMenuGroupIds = useMemo(() => {
    if (!filterBarActive) return null;
    return new Set(menusMatchingFilters.map((g) => String(g.id)));
  }, [filterBarActive, menusMatchingFilters]);

  const catalogStats = useMemo(() => {
    const itemsInList = products.length;
    const itemsInMenu = products.filter((p) => productInAnyMenuGroup(p, menuGroups)).length;
    const combosInList = combos.length;
    const combosInMenu = combos.filter((c) => comboInAnyMenuGroup(c, menuGroups)).length;
    return { itemsInList, itemsInMenu, combosInList, combosInMenu };
  }, [products, combos, menuGroups]);

  const editingCombo = useMemo(() => {
    if (!isEditingCombo || !comboEditId) return null;
    return combos.find((x) => x.id === comboEditId) ?? null;
  }, [isEditingCombo, comboEditId, combos]);

  const editingComboExistingImageUrls = useMemo(
    () => (editingCombo ? comboStripeUrls(editingCombo) : []),
    [editingCombo],
  );

  const shopViewUrl = useMemo(() => {
    const code = normalizeShopCode(seller?.shopCode ?? seller?.code ?? '');
    return code ? publicShopByCodeUrl(code) : '';
  }, [seller?.shopCode, seller?.code]);

  const comboRetailBase = useMemo(
    () => sumIncludedItemsRetail(comboSelectedIds, productsById),
    [comboSelectedIds, productsById],
  );

  const comboFinalPrice = useMemo(() => {
    const flatRaw = comboDiscountFlat.trim();
    const flat = flatRaw === '' ? 0 : Number(flatRaw);
    const flatOk = Number.isFinite(flat) && flat >= 0 ? flat : 0;
    const pctRaw = comboDiscountPercent.trim();
    const pct = pctRaw === '' ? 0 : Number(pctRaw);
    const pctOk = Number.isFinite(pct) && pct >= 0 ? Math.min(pct, 100) : 0;
    let v = comboRetailBase - flatOk;
    if (!Number.isFinite(v)) v = 0;
    v = Math.max(0, v);
    v *= 1 - pctOk / 100;
    return Math.round(v * 100) / 100;
  }, [comboRetailBase, comboDiscountFlat, comboDiscountPercent]);

  async function handleDeleteProduct(productId) {
    if (!seller?.id || demoReadOnly) return;
    if (!window.confirm('Delete this item? This cannot be undone.')) return;
    setDeleteBusyId(productId);
    setComboMsg('');
    try {
      await deleteProduct(productId, seller.id);
      await recomputeSellerSlotCount(seller.id);
    } catch (e) {
      setComboMsg(e.message ?? 'Could not delete.');
    } finally {
      setDeleteBusyId(null);
    }
  }

  async function handleDeleteCombo(comboId) {
    if (!seller?.id || demoReadOnly) return;
    if (!window.confirm('Delete this combo? It will be removed from any menus. This cannot be undone.')) return;
    setDeleteComboBusyId(comboId);
    setComboMsg('');
    try {
      await removeComboFromSellerMenus(seller.id, comboId);
      await deleteComboForSeller(comboId, seller.id);
      await recomputeSellerSlotCount(seller.id);
      if (comboEditId === comboId) {
        comboHydrateRef.current = '';
        comboHydrateSigRef.current = '';
        comboEditPriceDeriveDoneRef.current = '';
        setComboName('');
        setComboDiscountLabel('');
        setComboDiscountPercent('');
        setComboDiscountFlat('');
        setComboSelectedIds([]);
        setComboImageFiles([]);
        setSearchParams({ tab: 'combos' }, { replace: true });
      }
      setComboMsg('Combo deleted.');
    } catch (e) {
      setComboMsg(e.message ?? 'Could not delete combo.');
    } finally {
      setDeleteComboBusyId(null);
    }
  }

  function toggleComboProduct(id) {
    const sid = String(id);
    setComboSelectedIds((prev) => {
      const norm = prev.map((x) => String(x));
      return norm.includes(sid) ? norm.filter((x) => x !== sid) : [...norm, sid];
    });
  }

  function comboRowSelected(productId) {
    const pid = String(productId);
    return comboSelectedIds.some((x) => String(x) === pid);
  }

  async function handleCreateCombo(e) {
    e.preventDefault();
    if (!seller?.id || demoReadOnly) return;
    setComboMsg('');
    setComboBusy(true);
    const editingId = searchParams.get('editCombo')?.trim() ?? '';
    try {
      const name = comboName.trim();
      const price = comboFinalPrice;
      if (!name) throw new Error('Combo name is required.');
      if (comboSelectedIds.length === 0) {
        throw new Error('Select at least one item for this combo.');
      }
      if (!Number.isFinite(price) || price < 0) {
        throw new Error('Adjust discounts — combo price must be zero or more.');
      }
      const fields = {
        name,
        price,
        productIds: comboSelectedIds.map((x) => String(x).trim()).filter(Boolean),
      };
      if (comboDiscountLabel.trim()) {
        fields.discountLabel = comboDiscountLabel.trim();
      } else {
        fields.discountLabel = null;
      }
      const dPctRaw = comboDiscountPercent.trim();
      if (dPctRaw !== '') {
        const dPct = Number(dPctRaw);
        if (!Number.isFinite(dPct) || dPct < 0) {
          throw new Error('Enter a valid discount percent.');
        }
        fields.discountPercent = dPct;
      } else {
        fields.discountPercent = null;
      }
      const dFlatRaw = comboDiscountFlat.trim();
      if (dFlatRaw !== '') {
        const dFlat = Number(dFlatRaw);
        if (!Number.isFinite(dFlat) || dFlat < 0) {
          throw new Error('Enter a valid flat discount.');
        }
        fields.discountFlatAmount = dFlat;
      } else {
        fields.discountFlatAmount = null;
      }

      const targetId = editingId || (await createCombo(seller.id, fields));
      if (editingId) {
        await updateComboForSeller(editingId, seller.id, fields);
      }

      const urls = [];
      for (let i = 0; i < comboImageFiles.length; i++) {
        const file = comboImageFiles[i];
        const blob = await compressImageToJpegBlob(file);
        if (i === 0) {
          urls.push(await uploadComboImageJpeg(seller.id, targetId, blob));
        } else {
          urls.push(await uploadComboImageJpegAt(seller.id, targetId, i, blob));
        }
      }
      if (urls.length) {
        await updateComboForSeller(targetId, seller.id, {
          imageUrl: urls[0],
          imageUrls: urls,
        });
      }

      setComboName('');
      setComboDiscountLabel('');
      setComboDiscountPercent('');
      setComboDiscountFlat('');
      setComboSelectedIds([]);
      setComboImageFiles([]);
      comboHydrateRef.current = '';
      comboHydrateSigRef.current = '';
      setSearchParams({ tab: 'combos' }, { replace: true });
      if (editingId) {
        setComboMsg('Combo updated.');
      } else {
        setComboMsg('Combo saved.');
      }
      recomputeSellerSlotCount(seller.id).catch(() => {});
    } catch (err) {
      setComboMsg(err.message ?? 'Could not save combo.');
    } finally {
      setComboBusy(false);
    }
  }

  function onComboImagesPick(ev) {
    const picked = [...(ev.target.files || [])].slice(0, 6);
    ev.target.value = '';
    const ok = [];
    for (const file of picked) {
      if (!isAcceptedImageType(file)) {
        setComboMsg('Use JPG, PNG, or WebP for combo images.');
        return;
      }
      ok.push(file);
    }
    setComboImageFiles(ok);
    setComboMsg('');
  }

  function handleAddFromMaster() {
    window.alert('Browse master catalog — coming soon.');
  }

  function closeComboForm() {
    comboHydrateRef.current = '';
    comboHydrateSigRef.current = '';
    comboEditPriceDeriveDoneRef.current = '';
    setComboName('');
    setComboDiscountLabel('');
    setComboDiscountPercent('');
    setComboDiscountFlat('');
    setComboSelectedIds([]);
    setComboImageFiles([]);
    setComboMsg('');
    setSearchParams({ tab: 'combos' }, { replace: true });
  }

  const globalDiscountText =
    typeof seller?.globalDiscountText === 'string' && seller.globalDiscountText.trim()
      ? seller.globalDiscountText.trim()
      : '';
  const gPct = Number(seller?.globalDiscountPercent);
  const globalDiscountPct = Number.isFinite(gPct) && gPct > 0 ? gPct : null;
  const comboMsgMuted =
    Boolean(comboMsg) &&
    (comboMsg.startsWith('Combo saved') ||
      comboMsg.startsWith('Combo updated') ||
      comboMsg.startsWith('Combo deleted'));

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
    <div className={`menu-page${tab === 'menus' ? ' menu-page--menus-stats-pad' : ''}`}>
      <div className="menu-page-tabs-row">
        <div className="menu-page-tabs menu-page-tabs--segmented" role="tablist" aria-label="Menu sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`menu-page-tab${tab === t.id ? ' menu-page-tab--active' : ''}`}
              onClick={() => goTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="menu-page-filter-sticky card">
        <div className="menu-page-search-row">
          <label className="menu-page-search-wrap" htmlFor="menu-search">
            <span className="sr-only">Search</span>
            <Search className="menu-page-search-icon" size={20} strokeWidth={2.1} aria-hidden />
            <input
              id="menu-search"
              className="input menu-page-search-input"
              type="search"
              placeholder="Search items, combos, menu names…"
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>
        <div className="menu-page-filters__selects">
          <label className="menu-items-toolbar__field menu-items-toolbar__field--select">
            <span className="label">Cuisine category</span>
            {globalCuisinesLoad === 'loading' ? (
              <span className="muted menu-items-toolbar__hint">Loading…</span>
            ) : null}
            {globalCuisinesLoad === 'error' ? (
              <span className="error menu-items-toolbar__hint">Could not load cuisines.</span>
            ) : null}
            {products.length > 0 && cuisineOptionsFromCatalog.length === 0 ? (
              <span className="muted menu-items-toolbar__hint">No cuisine labels on items yet.</span>
            ) : null}
            <select
              className="input"
              value={selectedCuisineKey}
              onChange={(e) => setSelectedCuisineKey(e.target.value)}
              aria-label="Cuisine category"
              disabled={products.length === 0}
            >
              <option value="">All cuisines</option>
              {cuisineOptionsFromCatalog.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="menu-items-toolbar__field menu-items-toolbar__field--select">
            <span className="label">Menu category</span>
            {globalMenusLoad === 'loading' ? (
              <span className="muted menu-items-toolbar__hint">Loading…</span>
            ) : null}
            {globalMenusLoad === 'error' ? (
              <span className="error menu-items-toolbar__hint">Could not load menu categories.</span>
            ) : null}
            {cuisineFilteredProducts.length > 0 && menuOptionsFromCatalog.length === 0 ? (
              <span className="muted menu-items-toolbar__hint">No menu categories on items in this filter.</span>
            ) : null}
            <select
              className="input"
              value={selectedMenuKey}
              onChange={(e) => setSelectedMenuKey(e.target.value)}
              aria-label="Menu category"
              disabled={cuisineFilteredProducts.length === 0}
            >
              <option value="">All menu categories</option>
              {menuOptionsFromCatalog.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {tab === 'items' && (globalDiscountText || globalDiscountPct != null) ? (
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
          <div className="menu-items-toolbar card stack">
            <div className="menu-items-toolbar__actions">
              <Link to="/menu/add" className="btn btn-primary btn--sm">
                Add custom item
              </Link>
              <button type="button" className="btn btn-ghost btn--sm" onClick={handleAddFromMaster}>
                Master list
              </button>
            </div>
          </div>

          {productsError ? (
            <p className="error menu-page-products-error" style={{ margin: 0 }}>
              {productsError.message ?? 'Could not load items.'}
            </p>
          ) : null}

          {productsLoading ? (
            <p className="muted" style={{ margin: 0 }}>
              Loading items…
            </p>
          ) : filtered.length === 0 ? (
            <div className="card menu-page-empty">
              <p className="muted" style={{ margin: 0 }}>
                {search.trim() || selectedCuisineKey || selectedMenuKey
                  ? 'No items match your search or category filters.'
                  : 'No items yet. Tap Add item to build your menu.'}
              </p>
            </div>
          ) : (
            <div className="menu-page-grouped">
              {productHierarchy.map((block) => (
                <section key={block.cuisine} className="menu-page-cuisine-block" aria-label={`Cuisine ${block.cuisine}`}>
                  <h2 className="menu-page-cuisine-heading">
                    <span className="menu-page-cuisine-prefix">Cuisine</span>
                    <span className="menu-page-cuisine-name">{block.cuisine}</span>
                  </h2>
                  {block.menuSections.map(({ menuLabel, items }) => (
                    <div key={`${block.cuisine}-${menuLabel}`} className="menu-page-menu-block">
                      <h3 className="menu-page-menu-heading">
                        <span className="menu-page-menu-prefix">Menu</span>
                        <span className="menu-page-menu-name">{menuLabel}</span>
                      </h3>
                      <ul className="menu-admin-product-grid menu-admin-product-grid--compact">
                        {items.map((p) => {
                          const price = productPrice(p);
                          const img = productImageUrl(p);
                          const qty = Number(p.quantity);
                          const stockOk = Number.isFinite(qty);

                          return (
                            <li key={p.id}>
                              <article className="menu-admin-product-card menu-admin-product-card--compact card">
                                <div
                                  className="menu-admin-product-card__media"
                                  aria-hidden={img ? undefined : true}
                                >
                                  {img ? (
                                    <img src={img} alt="" loading="lazy" />
                                  ) : (
                                    <span className="menu-item-card-placeholder">No image</span>
                                  )}
                                </div>
                                <div className="menu-admin-product-card__body">
                                  <h3 className="menu-item-card-name">{productName(p)}</h3>
                                  <p className="menu-item-card-price">{formatPrice(price)}</p>
                                  <p
                                    className="menu-admin-product-card__qty muted"
                                    style={{ margin: 0, fontSize: '0.8125rem' }}
                                  >
                                    Available items: {stockOk ? String(Math.max(0, Math.floor(qty))) : '—'}
                                  </p>
                                  <div className="menu-admin-product-card__actions">
                                    <Link to={`/menu/edit/${p.id}`} className="btn btn-ghost btn--sm">
                                      Edit
                                    </Link>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn--sm menu-admin-product-card__del"
                                      disabled={demoReadOnly || deleteBusyId === p.id}
                                      onClick={() => void handleDeleteProduct(p.id)}
                                    >
                                      {deleteBusyId === p.id ? '…' : 'Delete'}
                                    </button>
                                  </div>
                                </div>
                              </article>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </>
      ) : null}

      {tab === 'combos' ? (
        <div className="menu-combos-wrap stack">
          {comboMsg ? (
            <p
              className={`card${comboMsgMuted ? ' muted' : ' error'}`}
              style={{ margin: 0, fontSize: '0.9375rem' }}
            >
              {comboMsg}
            </p>
          ) : null}

          {demoReadOnly ? (
            <p className="muted card" style={{ margin: 0 }}>
              Demo mode is read-only. Sign in to create combos.
            </p>
          ) : null}

          {!demoReadOnly && showComboForm ? (
            <form className="card stack menu-combo-form" onSubmit={handleCreateCombo}>
              <div className="menu-combo-form__title-row">
                <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
                  {isEditingCombo ? 'Edit combo' : 'New combo'}
                </h2>
                <button
                  type="button"
                  className="btn btn-ghost btn--sm"
                  disabled={comboBusy}
                  onClick={() => closeComboForm()}
                >
                  Back to list
                </button>
              </div>
              <label className="menu-combo-field">
                <span className="label">Combo name</span>
                <input
                  className="input"
                  value={comboName}
                  onChange={(ev) => setComboName(ev.target.value)}
                  required
                />
              </label>
              <div className="menu-combo-field">
                <span className="label">Includes (select items)</span>
                <ul className="menu-combo-pick-list">
                  {products.map((p) => (
                    <li key={p.id}>
                      <label className="menu-combo-pick-row">
                        <input
                          type="checkbox"
                          checked={comboRowSelected(p.id)}
                          onChange={() => toggleComboProduct(p.id)}
                        />
                        <span>{productName(p)}</span>
                        <span className="muted">{formatPrice(productPrice(p))}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="menu-combo-field muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                Base (sum of items): <strong style={{ color: 'var(--text)' }}>{formatPrice(comboRetailBase)}</strong>
              </p>
              <label className="menu-combo-field">
                <span className="label">Flat discount ₹ (optional)</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={comboDiscountFlat}
                  onChange={(ev) => setComboDiscountFlat(ev.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="menu-combo-field">
                <span className="label">% off (optional, after flat)</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={comboDiscountPercent}
                  onChange={(ev) => setComboDiscountPercent(ev.target.value)}
                  placeholder="0"
                />
              </label>
              <p className="menu-combo-field" style={{ margin: 0 }}>
                <span className="label">Final price</span>
                <strong className="menu-item-card-price" style={{ fontSize: '1.1rem' }}>
                  {formatPrice(comboFinalPrice)}
                </strong>
              </p>
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
                <span className="label">Combo images (optional, up to 6)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={onComboImagesPick}
                />
                {comboImageFiles.length ? (
                  <span className="muted" style={{ fontSize: '0.8125rem' }}>
                    {comboImageFiles.length} new file{comboImageFiles.length === 1 ? '' : 's'} selected
                    {isEditingCombo && editingComboExistingImageUrls.length
                      ? ' — replaces current images when you save.'
                      : ''}
                  </span>
                ) : null}
                {isEditingCombo && editingComboExistingImageUrls.length > 0 ? (
                  <div className="menu-combo-existing-images" aria-label="Current combo images">
                    <span className="muted" style={{ fontSize: '0.8125rem' }}>
                      Current images ({editingComboExistingImageUrls.length})
                    </span>
                    <div className="menu-combo-existing-images__row">
                      {editingComboExistingImageUrls.slice(0, 6).map((src, i) => (
                        <img
                          key={`${i}:${src}`}
                          src={src}
                          alt=""
                          className="menu-combo-existing-images__thumb"
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </label>
              <button type="submit" className="btn btn-primary" disabled={comboBusy}>
                {comboBusy ? 'Saving…' : isEditingCombo ? 'Save changes' : 'Save combo'}
              </button>
            </form>
          ) : null}

          {!showComboForm ? (
            <>
              {combosError ? (
                <p className="error card" style={{ margin: 0 }}>
                  {combosError.message ?? 'Could not load combos.'}
                </p>
              ) : null}
              {combosLoading ? (
                <p className="muted" style={{ margin: 0 }}>
                  Loading combos…
                </p>
              ) : combos.length === 0 ? (
                <div className="card menu-page-empty">
                  <p className="muted" style={{ margin: 0 }}>
                    No combos yet. Use the <strong style={{ color: 'var(--text)' }}>+ Add combo</strong> button.
                  </p>
                </div>
              ) : combosMatchingCategories.length === 0 ? (
                <div className="card menu-page-empty">
                  <p className="muted" style={{ margin: 0 }}>
                    No combos include items in the selected cuisine or menu category.
                  </p>
                </div>
              ) : combosFiltered.length === 0 ? (
                <div className="card menu-page-empty">
                  <p className="muted" style={{ margin: 0 }}>
                    No combos match your search.
                  </p>
                </div>
              ) : (
                <ul className="menu-admin-product-grid menu-admin-product-grid--compact menu-combo-list-as-items">
                  {combosFiltered.map((c) => {
                    const ids = normalizeComboProductIds(c);
                    const comboP = comboPriceValue(c);
                    const previewCount = comboCardPreviewUrls(c, ids, productsById, {
                      fillFromProducts: false,
                    }).length;
                    return (
                      <li key={c.id}>
                        <article className="menu-admin-product-card menu-admin-product-card--compact card">
                          <div
                            className="menu-admin-product-card__media menu-admin-product-card__media--combo"
                            aria-hidden={previewCount ? undefined : true}
                          >
                            <ComboCollageMedia
                              combo={c}
                              productIds={ids}
                              productsById={productsById}
                              fillFromProducts={false}
                            />
                          </div>
                          <div className="menu-admin-product-card__body">
                            <h3 className="menu-item-card-name">{comboTitle(c)}</h3>
                            <p className="menu-item-card-price" style={{ margin: 0 }}>
                              {formatPrice(comboP)}
                            </p>
                            <div className="menu-admin-product-card__actions">
                              <Link
                                to={`/menu?tab=combos&editCombo=${encodeURIComponent(c.id)}`}
                                className="btn btn-ghost btn--sm"
                              >
                                Edit
                              </Link>
                              <button
                                type="button"
                                className="btn btn-ghost btn--sm menu-admin-product-card__del"
                                disabled={demoReadOnly || deleteComboBusyId === c.id}
                                onClick={() => void handleDeleteCombo(c.id)}
                              >
                                {deleteComboBusyId === c.id ? '…' : 'Delete'}
                              </button>
                            </div>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {tab === 'menus' && seller?.id ? (
        <>
          <div className="menu-menugroups-page">
            <MenusPanel
              ref={menusPanelRef}
              sellerId={seller.id}
              products={products}
              combos={combos}
              readOnly={demoReadOnly}
              menuSessionOverrideGroupId={String(seller.menuSessionOverrideGroupId ?? '').trim()}
              allowedMenuGroupIds={allowedMenuGroupIds}
            />
          </div>
          <footer className="menu-page-stats-bar menu-page-stats-bar--menus" role="region" aria-label="Catalog summary">
            <div className="menu-page-stats-bar__scroll">
              <div className="menu-page-stats-bar__track">
                <div className="menu-page-stat-chip" aria-label={`Items in list: ${catalogStats.itemsInList}`}>
                  <span className="menu-page-stat-chip__lbl">Items in list</span>
                  <span className="menu-page-stat-chip__val">{catalogStats.itemsInList}</span>
                </div>
                <div className="menu-page-stat-chip" aria-label={`Items in menu: ${catalogStats.itemsInMenu}`}>
                  <span className="menu-page-stat-chip__lbl">Items in menu</span>
                  <span className="menu-page-stat-chip__val">{catalogStats.itemsInMenu}</span>
                </div>
                <div className="menu-page-stat-chip" aria-label={`Combos in list: ${catalogStats.combosInList}`}>
                  <span className="menu-page-stat-chip__lbl">Combos</span>
                  <span className="menu-page-stat-chip__val">{catalogStats.combosInList}</span>
                </div>
                <div className="menu-page-stat-chip" aria-label={`Combos in menu: ${catalogStats.combosInMenu}`}>
                  <span className="menu-page-stat-chip__lbl">Combos in menu</span>
                  <span className="menu-page-stat-chip__val">{catalogStats.combosInMenu}</span>
                </div>
                <button
                  type="button"
                  className="menu-page-stat-chip menu-page-stat-chip--btn"
                  disabled={!shopViewUrl}
                  onClick={() => {
                    if (shopViewUrl) window.open(shopViewUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  View menu
                </button>
              </div>
            </div>
          </footer>
        </>
      ) : null}

      {tab === 'items' ? (
        <Link to="/menu/add" className="menu-add-fab btn btn-primary" aria-label="Add item">
          + Add item
        </Link>
      ) : null}
      {tab === 'combos' && !demoReadOnly && !showComboForm ? (
        <button
          type="button"
          className="menu-add-fab menu-add-fab--wide btn btn-primary"
          onClick={() => {
            setComboMsg('');
            setSearchParams({ tab: 'combos', newCombo: '1' }, { replace: true });
          }}
          aria-label="Add combo"
        >
          + Add combo
        </button>
      ) : null}
      {tab === 'menus' && !demoReadOnly ? (
        <button
          type="button"
          className="menu-add-fab menu-add-fab--icon btn btn-primary"
          onClick={() => menusPanelRef.current?.openCreateSheet?.()}
          aria-label="Create menu"
        >
          <Plus size={24} strokeWidth={2.25} aria-hidden />
        </button>
      ) : null}

      <p className="muted menu-page-back" style={{ margin: 0, fontSize: '0.8125rem' }}>
        <Link to="/dashboard">← Back to dashboard</Link>
      </p>
    </div>
  );
}
