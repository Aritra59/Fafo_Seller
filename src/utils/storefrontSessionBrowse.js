import { pickScheduledMenu } from './menuSchedule';

/** @param {any} menu @param {any} p */
export function productInMenu(menu, p) {
  if (!menu || !p?.id) return false;
  const fromDoc = menu.productIds ?? menu.itemIds;
  if (Array.isArray(fromDoc) && fromDoc.some((x) => String(x) === String(p.id))) return true;
  if (String(p.menuGroupId ?? '') === String(menu.id)) return true;
  const arr = p.menuGroupIds;
  if (Array.isArray(arr) && arr.some((x) => String(x ?? '').trim() === String(menu.id))) return true;
  return false;
}

/** @param {any} menu @param {any} c */
export function comboInMenu(menu, c) {
  if (!menu || !c?.id) return false;
  const ids = Array.isArray(menu.comboIds) ? menu.comboIds : [];
  return ids.map(String).includes(String(c.id));
}

/**
 * Same resolution order as the dashboard menu session pill: override → storefront → schedule.
 * @param {{ seller: any, menuGroupRows: any[], now?: Date }} args
 */
export function resolveActiveMenuGroupForSeller({ seller, menuGroupRows, now = new Date() }) {
  const menus = Array.isArray(menuGroupRows) ? menuGroupRows : [];
  const oidRaw = seller?.menuSessionOverrideGroupId;
  if (oidRaw != null && String(oidRaw).trim() !== '') {
    const oid = String(oidRaw).trim();
    const g = menus.find((m) => String(m.id).trim() === oid);
    if (g) return g;
  }
  const sfRaw = seller?.storefrontMenuGroupId;
  if (sfRaw != null && String(sfRaw).trim() !== '') {
    const gid = String(sfRaw).trim();
    const g = menus.find((m) => String(m.id).trim() === gid);
    if (g) return g;
  }
  return pickScheduledMenu(menus, now);
}

/** Products visible for the current storefront menu session (buyer-style scope). */
export function productsForStorefrontSession(activeMenu, menuRows, productRows) {
  const rows = productRows.filter((p) => p.available !== false);
  if (activeMenu) {
    return rows.filter((p) => productInMenu(activeMenu, p));
  }
  const activeMenus = menuRows.filter((m) => m.active !== false && m.isActive !== false);
  if (activeMenus.length === 0) return rows;
  return rows.filter((p) => activeMenus.some((m) => productInMenu(m, p)));
}

/** Combos that belong to the active menu session (via combo ids on the menu). */
export function combosForStorefrontSession(activeMenu, menuRows, comboRows) {
  if (activeMenu) {
    return comboRows.filter((c) => comboInMenu(activeMenu, c));
  }
  const activeMenus = menuRows.filter((m) => m.active !== false && m.isActive !== false);
  if (activeMenus.length === 0) return comboRows;
  return comboRows.filter((c) => activeMenus.some((m) => comboInMenu(m, c)));
}
