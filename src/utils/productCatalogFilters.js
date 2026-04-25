import {
  getCuisineCategoryLabel,
  getProductMenuCategoryLabel,
} from '../services/firestore';

/** @param {any} p */
export function cuisineFilterKey(p) {
  const id = String(p.cuisineCategoryId ?? '').trim();
  if (id) return `id:${id}`;
  return `name:${getCuisineCategoryLabel(p)}`;
}

/** @param {any} p @param {any[]} globalCuisines */
export function cuisineFilterLabel(p, globalCuisines) {
  const id = String(p.cuisineCategoryId ?? '').trim();
  if (id) {
    const row = globalCuisines.find((c) => c.id === id);
    return row?.name?.trim() || getCuisineCategoryLabel(p);
  }
  return getCuisineCategoryLabel(p);
}

/** @param {any} p */
export function menuFilterKey(p) {
  const id = String(p.menuCategoryId ?? '').trim();
  if (id) return `id:${id}`;
  return `name:${getProductMenuCategoryLabel(p)}`;
}

/** @param {any} p @param {any[]} globalMenus */
export function menuFilterLabel(p, globalMenus) {
  const id = String(p.menuCategoryId ?? '').trim();
  if (id) {
    const row = globalMenus.find((m) => m.id === id);
    return row?.name?.trim() || getProductMenuCategoryLabel(p);
  }
  return getProductMenuCategoryLabel(p);
}
