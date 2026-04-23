import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  limit,
} from 'firebase/firestore';
import { isDemoSellerId } from '../constants/demoMode';
import { db } from '../firebase';

/**
 * Menu groups: `sellers/{sellerId}/menuGroups/{id}`
 * Fields: menuName, sortOrder, active, productIds[], createdAt
 * Products: `menuGroupId` on `products/{id}`
 */
function col(sellerId) {
  return collection(db, 'sellers', String(sellerId), 'menuGroups');
}

export async function listMenuGroups(sellerId) {
  const sid = String(sellerId ?? '').trim();
  if (!sid) return [];
  let snap;
  try {
    snap = await getDocs(query(col(sid), orderBy('sortOrder', 'asc')));
  } catch {
    snap = await getDocs(query(col(sid)));
  }
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
}

/**
 * Set which products belong to a menu group. Clears this group from other products, assigns selected.
 */
export async function setMenuGroupProductIds(sellerId, groupId, productIds) {
  const sid = String(sellerId ?? '').trim();
  const gid = String(groupId ?? '').trim();
  if (!sid || !gid) throw new Error('Missing seller or group.');
  if (isDemoSellerId(sid)) throw new Error('Demo is read-only.');
  const want = new Set((productIds || []).map((x) => String(x).trim()).filter(Boolean));
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
  await updateDoc(doc(db, 'sellers', sid, 'menuGroups', gid), {
    productIds: [...want],
    updatedAt: serverTimestamp(),
  });
}

export async function createMenuGroup(
  sellerId,
  { menuName, sortOrder = 0, active = true, productIds = [] } = {},
) {
  const name = String(menuName ?? '').trim();
  if (!name) throw new Error('Menu name required');
  const sid = String(sellerId ?? '').trim();
  if (!sid) throw new Error('Missing seller');
  if (isDemoSellerId(sid)) throw new Error('Demo is read-only.');
  const ref = await addDoc(col(sid), {
    menuName: name,
    sortOrder: Number(sortOrder) || 0,
    active: Boolean(active),
    productIds: Array.isArray(productIds) ? productIds : [],
    createdAt: serverTimestamp(),
  });
  if (productIds?.length) {
    await setMenuGroupProductIds(sid, ref.id, productIds);
  }
  return ref.id;
}

export async function updateMenuGroupMeta(sellerId, groupId, { menuName, sortOrder, active } = {}) {
  const sid = String(sellerId ?? '').trim();
  const gid = String(groupId ?? '').trim();
  if (!sid || !gid) throw new Error('Missing id');
  if (isDemoSellerId(sid)) throw new Error('Demo is read-only.');
  const payload = { updatedAt: serverTimestamp() };
  if (menuName != null) payload.menuName = String(menuName).trim();
  if (sortOrder != null) payload.sortOrder = Number(sortOrder) || 0;
  if (active != null) payload.active = Boolean(active);
  await updateDoc(doc(db, 'sellers', sid, 'menuGroups', gid), payload);
}
