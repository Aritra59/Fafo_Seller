import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { isDemoSellerId } from '../constants/demoMode';
import { db } from '../firebase';

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

function mapGroupDoc(d) {
  const data = d.data();
  const name = data.name != null && String(data.name).trim() ? String(data.name).trim() : '';
  return {
    id: d.id,
    ...data,
    name: name || (data.menuName != null ? String(data.menuName).trim() : '') || '',
    /** @deprecated UI compat */
    menuName: name || (data.menuName != null ? String(data.menuName).trim() : '') || d.id,
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
  await updateDoc(gRef, {
    productIds: uniqueProductIds([...want]),
    updatedAt: serverTimestamp(),
  });
}

/**
 * @param {string} sellerId
 * @param {{ name: string, sortOrder?: number, active?: boolean, productIds?: string[] }} data
 */
export async function createMenuGroup(
  sellerId,
  { name, menuName, sortOrder = 0, active = true, productIds = [] } = {},
) {
  const n = String(name ?? menuName ?? '')
    .trim();
  if (!n) throw new Error('Menu name required');
  const sid = String(sellerId ?? '').trim();
  if (!sid) throw new Error('Missing seller');
  if (isDemoSellerId(sid)) throw new Error('Demo is read-only.');

  const productIdsUnique = uniqueProductIds(productIds);
  const ref = await addDoc(collection(db, COL), {
    sellerId: sid,
    name: n,
    slug: slugifyMenuGroupName(n),
    productIds: productIdsUnique,
    active: Boolean(active),
    sortOrder: Number(sortOrder) || 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (productIdsUnique.length) {
    await setMenuGroupProductIds(sid, ref.id, productIdsUnique);
  }
  // eslint-disable-next-line no-console
  console.log('Saved menu group', { id: ref.id, name: n, productIds: productIdsUnique });
  return ref.id;
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

/**
 * After saving a product, keep `menuGroups` productIds in sync and move between groups.
 * @param {string | null} previousGroupId — pass previous value on edit, or null for new product
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
  const next = newGroupId && String(newGroupId).trim() ? String(newGroupId).trim() : null;
  const prev =
    previousGroupId != null && String(previousGroupId).trim() ? String(previousGroupId).trim() : null;

  async function removeFromGroup(gid) {
    const s = await getDoc(doc(db, COL, gid));
    if (!s.exists() || s.data().sellerId !== sid) return;
    const raw = s.data().productIds || [];
    const nextPids = uniqueProductIds(raw.filter((x) => String(x) !== pid));
    await updateDoc(doc(db, COL, gid), {
      productIds: nextPids,
      updatedAt: serverTimestamp(),
    });
  }

  async function addToGroup(gid) {
    const s = await getDoc(doc(db, COL, gid));
    if (!s.exists() || s.data().sellerId !== sid) return;
    const nextPids = uniqueProductIds([...(s.data().productIds || []), pid]);
    await updateDoc(doc(db, COL, gid), {
      productIds: nextPids,
      updatedAt: serverTimestamp(),
    });
  }

  if (next === prev) {
    if (next) {
      const s = await getDoc(doc(db, COL, next));
      if (s.exists() && s.data().sellerId === sid) {
        const pids = uniqueProductIds([...(s.data().productIds || []), pid]);
        await updateDoc(doc(db, COL, next), {
          productIds: pids,
          updatedAt: serverTimestamp(),
        });
      }
    }
    return;
  }
  if (prev) {
    await removeFromGroup(prev);
  }
  if (next) {
    await addToGroup(next);
  }
}
