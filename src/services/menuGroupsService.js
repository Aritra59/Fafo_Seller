import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { DEMO_MENU_GROUPS, isDemoSellerId } from '../constants/demoMode';
import { db } from '../firebase';
import { resolveMenuDays } from '../utils/menuSchedule';

const COL = 'menuGroups';

/** @param {string} name */
export function slugifyMenuGroupName(name) {
  return (
    String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'group'
  );
}

function uniqueProductIds(productIds) {
  return [...new Set((productIds || []).map((x) => String(x).trim()).filter(Boolean))];
}

function uniqueStringIds(ids) {
  return [...new Set((ids || []).map((x) => String(x).trim()).filter(Boolean))];
}

function mapGroupDoc(d) {
  const data = d.data();
  const name = data.name != null && String(data.name).trim() ? String(data.name).trim() : '';
  const productIds = uniqueProductIds(data.productIds ?? data.itemIds);
  const comboIds = uniqueStringIds(data.comboIds);
  const schedulePreset = String(data.schedulePreset ?? '').toLowerCase() || 'all';
  const daysStored = Array.isArray(data.days) ? data.days : [];
  const rawDays = daysStored
    .map((x) => (typeof x === 'number' ? x : Number(x)))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
  const days = resolveMenuDays(schedulePreset, daysStored);
  return {
    id: d.id,
    ...data,
    name: name || (data.menuName != null ? String(data.menuName).trim() : '') || '',
    /** @deprecated UI compat */
    menuName: name || (data.menuName != null ? String(data.menuName).trim() : '') || d.id,
    productIds,
    itemIds: productIds,
    comboIds,
    schedulePreset,
    rawDays,
    days,
    startTime: typeof data.startTime === 'string' ? data.startTime : '',
    endTime: typeof data.endTime === 'string' ? data.endTime : '',
    isActive: data.active !== false && data.isActive !== false,
    manualOverride: data.manualOverride === true,
  };
}

/**
 * @param {string} sellerId
 * @returns {Promise<Array<{id: string, name: string, menuName: string, productIds: string[], active: boolean, sortOrder: number, slug: string, sellerId: string, ...}>>}
 */
export async function listMenuGroups(sellerId) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) return [];
  let snap;
  try {
    snap = await getDocs(
      query(collection(db, COL), where('sellerId', '==', sid), orderBy('sortOrder', 'asc')),
    );
  } catch {
    try {
      snap = await getDocs(
        query(collection(db, COL), where('sellerId', '==', sid), limit(200)),
      );
    } catch {
      return [];
    }
    const rows = snap.docs.map((d) => mapGroupDoc(d));
    rows.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    // eslint-disable-next-line no-console
    console.log('Loaded menu groups', rows);
    return rows;
  }
  const rows = snap.docs.map((d) => mapGroupDoc(d));
  // eslint-disable-next-line no-console
  console.log('Loaded menu groups', rows);
  return rows;
}

/**
 * Live listener for seller menus (`menuGroups`).
 * @param {string} sellerId
 * @param {(rows: ReturnType<typeof mapGroupDoc>[]) => void} onData
 * @param {(err: Error) => void} [onError]
 * @returns {() => void}
 */
export function subscribeMenuGroupsBySellerId(sellerId, onData, onError) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) {
    onData([]);
    return () => {};
  }
  if (isDemoSellerId(sid)) {
    onData([...DEMO_MENU_GROUPS]);
    return () => {};
  }
  const qFallback = query(collection(db, COL), where('sellerId', '==', sid), limit(200));
  return onSnapshot(
    qFallback,
    (snap) => {
      const rows = snap.docs.map((d) => mapGroupDoc(d));
      rows.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
      onData(rows);
    },
    (err) => {
      onError?.(err);
      onData([]);
    },
  );
}

/**
 * Set which products belong to a menu group. Updates `menuGroups` doc and each product’s `menuGroupId`.
 * Does not delete products. Dedupes `productIds` on the group.
 */
export async function setMenuGroupProductIds(sellerId, groupId, productIds) {
  const sid = String(sellerId ?? '').trim();
  const gid = String(groupId ?? '').trim();
  if (!sid || !gid) throw new Error('Missing seller or group.');
  if (isDemoSellerId(sid)) throw new Error('Demo is read-only.');
  const gRef = doc(db, COL, gid);
  const gSnap = await getDoc(gRef);
  if (!gSnap.exists() || gSnap.data().sellerId !== sid) {
    throw new Error('Menu group not found.');
  }
  const want = new Set(uniqueProductIds(productIds));
  const productsSnap = await getDocs(
    query(collection(db, 'products'), where('sellerId', '==', sid), limit(500)),
  );
  const all = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const updates = [];
  for (const p of all) {
    const was = p.menuGroupId === gid;
    const should = want.has(p.id);
    if (should && p.menuGroupId !== gid) {
      updates.push({ id: p.id, menuGroupId: gid });
    } else if (!should && was) {
      updates.push({ id: p.id, menuGroupId: null });
    }
  }
  const chunk = 400;
  for (let i = 0; i < updates.length; i += chunk) {
    const batch = writeBatch(db);
    for (const u of updates.slice(i, i + chunk)) {
      batch.update(doc(db, 'products', u.id), {
        menuGroupId: u.menuGroupId,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
  const merged = uniqueProductIds([...want]);
  await updateDoc(gRef, {
    productIds: merged,
    itemIds: merged,
    updatedAt: serverTimestamp(),
  });
}

function uniqueDayIndices(days) {
  const out = [];
  for (const x of days || []) {
    const n = typeof x === 'number' ? x : Number(x);
    if (Number.isFinite(n) && n >= 0 && n <= 6) out.push(n);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * @param {string} sellerId
 * @param {{
 *   name: string,
 *   menuName?: string,
 *   sortOrder?: number,
 *   active?: boolean,
 *   productIds?: string[],
 *   itemIds?: string[],
 *   comboIds?: string[],
 *   schedulePreset?: string,
 *   days?: number[],
 *   startTime?: string,
 *   endTime?: string,
 * }} data
 */
export async function createMenuGroup(
  sellerId,
  {
    name,
    menuName,
    sortOrder = 0,
    active = true,
    productIds = [],
    itemIds,
    comboIds = [],
    schedulePreset = 'all',
    days = [],
    startTime = '',
    endTime = '',
  } = {},
) {
  const n = String(name ?? menuName ?? '')
    .trim();
  if (!n) throw new Error('Menu name required');
  const sid = String(sellerId ?? '').trim();
  if (!sid) throw new Error('Missing seller');
  if (isDemoSellerId(sid)) throw new Error('Demo is read-only.');

  const productIdsUnique = uniqueProductIds(itemIds ?? productIds);
  const comboIdsUnique = uniqueStringIds(comboIds);
  const preset = String(schedulePreset || 'all').toLowerCase();
  const daysToStore = preset === 'custom' ? uniqueDayIndices(days) : [];
  const st = String(startTime ?? '').trim();
  const et = String(endTime ?? '').trim();
  const ref = await addDoc(collection(db, COL), {
    sellerId: sid,
    name: n,
    slug: slugifyMenuGroupName(n),
    productIds: productIdsUnique,
    itemIds: productIdsUnique,
    comboIds: comboIdsUnique,
    schedulePreset: preset,
    days: daysToStore,
    startTime: st,
    endTime: et,
    manualOverride: false,
    active: Boolean(active),
    isActive: Boolean(active),
    sortOrder: Number(sortOrder) || 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (productIdsUnique.length) {
    await setMenuGroupProductIds(sid, ref.id, productIdsUnique);
  }
  // eslint-disable-next-line no-console
  console.log('Saved menu', { id: ref.id, name: n, productIds: productIdsUnique, comboIds: comboIdsUnique });
  return ref.id;
}

/**
 * Update menu schedule, combos, and items for an existing `menuGroups` doc.
 */
export async function saveMenuDefinition(sellerId, groupId, payload = {}) {
  const sid = String(sellerId ?? '').trim();
  const gid = String(groupId ?? '').trim();
  if (!sid || !gid) throw new Error('Missing seller or menu.');
  if (isDemoSellerId(sid)) throw new Error('Demo is read-only.');
  const gRef = doc(db, COL, gid);
  const gSnap = await getDoc(gRef);
  if (!gSnap.exists() || gSnap.data().sellerId !== sid) {
    throw new Error('Menu not found.');
  }

  const {
    name,
    active,
    itemIds,
    comboIds,
    schedulePreset,
    days,
    startTime,
    endTime,
  } = payload;

  if (name != null) {
    const nameTrim = String(name).trim();
    if (!nameTrim) throw new Error('Menu name required.');
    await updateMenuGroupMeta(sid, gid, { name: nameTrim });
  }
  if (active != null) {
    await updateMenuGroupMeta(sid, gid, { active: Boolean(active), isActive: Boolean(active) });
  }

  const nextPreset =
    schedulePreset != null
      ? String(schedulePreset).toLowerCase()
      : String(gSnap.data().schedulePreset ?? 'all').toLowerCase() || 'all';

  if (itemIds != null) {
    await setMenuGroupProductIds(sid, gid, uniqueProductIds(itemIds));
  }

  const patch = { updatedAt: serverTimestamp(), manualOverride: false };
  if (comboIds != null) {
    patch.comboIds = uniqueStringIds(comboIds);
  }
  if (schedulePreset != null) {
    patch.schedulePreset = nextPreset;
    if (nextPreset !== 'custom') {
      patch.days = [];
    }
  }
  if (days != null && nextPreset === 'custom') {
    patch.days = uniqueDayIndices(days);
  }
  if (startTime != null) {
    patch.startTime = String(startTime).trim();
  }
  if (endTime != null) {
    patch.endTime = String(endTime).trim();
  }

  await updateDoc(gRef, patch);
}

/**
 * Remove a combo id from every `menuGroups` row for this seller (keeps menus consistent after combo delete).
 */
export async function removeComboFromSellerMenus(sellerId, comboId) {
  const sid = String(sellerId ?? '').trim();
  const cid = String(comboId ?? '').trim();
  if (!sid || !cid) return;
  if (isDemoSellerId(sid)) return;

  const rows = await listMenuGroups(sid);
  const updates = rows.filter((g) => (g.comboIds || []).map(String).includes(cid));
  await Promise.all(
    updates.map((g) =>
      saveMenuDefinition(sid, g.id, {
        comboIds: (g.comboIds || []).filter((x) => String(x) !== cid),
      }),
    ),
  );
}

/**
 * Update group metadata; optional rename refreshes `slug` from `name`.
 * @param {string} groupId
 * @param {{ name?: string, sortOrder?: number, active?: boolean, slug?: string }} fields
 */
export async function updateMenuGroupMeta(sellerId, groupId, fields = {}) {
  const sid = String(sellerId ?? '').trim();
  const gid = String(groupId ?? '').trim();
  if (!sid || !gid) throw new Error('Missing id');
  if (isDemoSellerId(sid)) throw new Error('Demo is read-only.');
  const gRef = doc(db, COL, gid);
  const gSnap = await getDoc(gRef);
  if (!gSnap.exists() || gSnap.data().sellerId !== sid) {
    throw new Error('Menu group not found.');
  }
  const payload = { updatedAt: serverTimestamp() };
  if (fields.name != null) {
    const name = String(fields.name).trim();
    if (name) {
      payload.name = name;
      if (fields.slug == null) {
        payload.slug = slugifyMenuGroupName(name);
      }
    }
  }
  if (fields.slug != null) {
    const s = String(fields.slug).trim();
    if (s) payload.slug = s;
  }
  if (fields.sortOrder != null) {
    payload.sortOrder = Number(fields.sortOrder) || 0;
  }
  if (fields.active != null) {
    payload.active = Boolean(fields.active);
    payload.isActive = Boolean(fields.active);
  }
  if (fields.isActive != null) {
    payload.isActive = Boolean(fields.isActive);
    payload.active = Boolean(fields.isActive);
  }
  await updateDoc(gRef, payload);
}

/**
 * Deletes the group document only. Clears `menuGroupId` on products; does not delete products.
 */
export async function deleteMenuGroup(sellerId, groupId) {
  const sid = String(sellerId ?? '').trim();
  const gid = String(groupId ?? '').trim();
  if (!sid || !gid) throw new Error('Missing id');
  if (isDemoSellerId(sid)) throw new Error('Demo is read-only.');
  const gRef = doc(db, COL, gid);
  const gSnap = await getDoc(gRef);
  if (!gSnap.exists() || gSnap.data().sellerId !== sid) {
    throw new Error('Menu group not found.');
  }
  const productsSnap = await getDocs(
    query(collection(db, 'products'), where('sellerId', '==', sid), limit(500)),
  );
  const toClear = productsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.menuGroupId === gid);
  for (let i = 0; i < toClear.length; i += 400) {
    const b = writeBatch(db);
    for (const p of toClear.slice(i, i + 400)) {
      b.update(doc(db, 'products', p.id), { menuGroupId: null, updatedAt: serverTimestamp() });
    }
    await b.commit();
  }
  await deleteDoc(gRef);
}

function menuGroupIdSet(val) {
  if (Array.isArray(val)) {
    return new Set(val.map((x) => String(x ?? '').trim()).filter(Boolean));
  }
  const s = val != null && String(val).trim() ? String(val).trim() : '';
  return new Set(s ? [s] : []);
}

/**
 * After saving a product, keep `menuGroups` productIds in sync and move between groups.
 * @param {string | string[] | null} newGroupId — one menu id, several ids, or null/empty
 * @param {string | string[] | null} previousGroupId — previous assignment(s) on edit
 */
export async function syncMenuGroupAfterProductSave(
  sellerId,
  productId,
  newGroupId,
  previousGroupId = null,
) {
  const pid = String(productId ?? '').trim();
  const sid = String(sellerId ?? '').trim();
  if (!pid || !sid || isDemoSellerId(sid)) return;
  const nextSet = menuGroupIdSet(newGroupId);
  const prevSet = menuGroupIdSet(previousGroupId);

  async function removeFromGroup(gid) {
    const s = await getDoc(doc(db, COL, gid));
    if (!s.exists() || s.data().sellerId !== sid) return;
    const raw = s.data().productIds || s.data().itemIds || [];
    const nextPids = uniqueProductIds(raw.filter((x) => String(x) !== pid));
    await updateDoc(doc(db, COL, gid), {
      productIds: nextPids,
      itemIds: nextPids,
      updatedAt: serverTimestamp(),
    });
  }

  async function addToGroup(gid) {
    const s = await getDoc(doc(db, COL, gid));
    if (!s.exists() || s.data().sellerId !== sid) return;
    const nextPids = uniqueProductIds([...(s.data().productIds || s.data().itemIds || []), pid]);
    await updateDoc(doc(db, COL, gid), {
      productIds: nextPids,
      itemIds: nextPids,
      updatedAt: serverTimestamp(),
    });
  }

  for (const gid of prevSet) {
    if (!nextSet.has(gid)) {
      await removeFromGroup(gid);
    }
  }
  for (const gid of nextSet) {
    await addToGroup(gid);
  }
}
