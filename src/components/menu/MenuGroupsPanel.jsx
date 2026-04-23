import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createMenuGroup,
  listMenuGroups,
  setMenuGroupProductIds,
} from '../../services/menuGroupsService';

function productName(p) {
  const n = p?.name ?? p?.title;
  return typeof n === 'string' && n.trim() ? n.trim() : 'Untitled';
}

export function MenuGroupsPanel({ sellerId, products = [], readOnly = false }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [createName, setCreateName] = useState('');
  const [createPick, setCreatePick] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editPick, setEditPick] = useState(() => new Set());

  const load = useCallback(async () => {
    if (!sellerId) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr('');
    try {
      setGroups(await listMenuGroups(sellerId));
    } catch (e) {
      setErr(e?.message ?? 'Could not load menu groups.');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedProducts = useMemo(
    () =>
      [...products].sort((a, b) =>
        productName(a).localeCompare(productName(b), undefined, { sensitivity: 'base' }),
      ),
    [products],
  );

  function pickForGroup(group) {
    const ids = new Set();
    for (const p of products) {
      if (p.menuGroupId === group.id) ids.add(p.id);
    }
    const fromDoc = group.productIds;
    if (Array.isArray(fromDoc)) {
      for (const x of fromDoc) {
        const id = String(x ?? '').trim();
        if (id) ids.add(id);
      }
    }
    return ids;
  }

  function countForGroup(g) {
    return pickForGroup(g).size;
  }

  function openEdit(g) {
    setEditingId(g.id);
    setEditPick(pickForGroup(g));
  }

  function toggleCreate(id) {
    if (readOnly) return;
    setCreatePick((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleEdit(id) {
    if (readOnly) return;
    setEditPick((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (readOnly || !sellerId) return;
    const name = createName.trim();
    if (!name) {
      setErr('Enter a menu name.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const ids = [...createPick];
      await createMenuGroup(sellerId, { menuName: name, productIds: ids });
      setCreateName('');
      setCreatePick(new Set());
      await load();
    } catch (ex) {
      setErr(ex?.message ?? 'Could not create group.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (readOnly || !sellerId || !editingId) return;
    setSaving(true);
    setErr('');
    try {
      await setMenuGroupProductIds(sellerId, editingId, [...editPick]);
      setEditingId(null);
      setEditPick(new Set());
      await load();
    } catch (ex) {
      setErr(ex?.message ?? 'Could not save group.');
    } finally {
      setSaving(false);
    }
  }

  if (!sellerId) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Sign in to manage menu groups.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Loading menu groups…
      </p>
    );
  }

  return (
    <div className="menu-groups-panel stack" style={{ gap: '1rem' }}>
      <p className="muted" style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.45 }}>
        Create named menus (Breakfast, Lunch, South Indian, etc.), assign products, then set each
        product’s <strong>menu group</strong> in add/edit, or from this screen. The dashboard
        <strong> menu session</strong> filter controls which groups buyers see in the shop.
      </p>

      {err ? (
        <p className="error" style={{ margin: 0, fontSize: '0.9rem' }}>
          {err}
        </p>
      ) : null}

      {readOnly ? (
        <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
          Demo mode: read-only.
        </p>
      ) : (
        <form className="card menu-groups-form stack" onSubmit={handleCreate} style={{ gap: '0.75rem' }}>
          <h2 className="menu-groups-form__title" style={{ margin: 0, fontSize: '1.05rem' }}>
            New menu group
          </h2>
          <label className="label" htmlFor="menu-group-name">
            Name
          </label>
          <div className="menu-groups-form__row">
            <input
              id="menu-group-name"
              className="input"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Breakfast"
              maxLength={80}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !createName.trim()}
            >
              {saving ? '…' : 'Create group'}
            </button>
          </div>
          <p className="label" style={{ margin: 0 }}>
            Include products
          </p>
          <ul className="menu-groups-pick-list">
            {sortedProducts.length === 0 ? (
              <li className="muted" style={{ fontSize: '0.9rem' }}>
                No products yet. Add products under the Products tab.
              </li>
            ) : (
              sortedProducts.map((p) => (
                <li key={p.id}>
                  <label className="menu-groups-pick-row">
                    <input
                      type="checkbox"
                      checked={createPick.has(p.id)}
                      onChange={() => toggleCreate(p.id)}
                    />
                    <span>{productName(p)}</span>
                  </label>
                </li>
              ))
            )}
          </ul>
        </form>
      )}

      <div className="stack" style={{ gap: '0.7rem' }}>
        <h2 className="menu-groups-form__title" style={{ margin: 0, fontSize: '1.05rem' }}>
          Your menu groups
        </h2>
        {groups.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            No groups yet. Create one above to segment your menu for the storefront.
          </p>
        ) : (
          <ul className="stack menu-groups-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {groups.map((g) => {
              const expanded = editingId === g.id;
              return (
                <li key={g.id} className="card menu-groups-list-item">
                  <div className="menu-groups-list-item__head">
                    <div>
                      <p className="menu-groups-list-name" style={{ margin: 0, fontWeight: 700 }}>
                        {g.menuName || g.id}
                      </p>
                      <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>
                        {countForGroup(g)} product{countForGroup(g) === 1 ? '' : 's'}
                        <code
                          className="menu-groups-id"
                          style={{
                            display: 'block',
                            fontSize: '0.7rem',
                            color: 'var(--text-muted)',
                            marginTop: 0.25,
                          }}
                        >
                          {g.id}
                        </code>
                      </p>
                    </div>
                    {!readOnly && (
                      <div className="menu-groups-list-item__actions">
                        {expanded ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost btn--sm"
                              onClick={() => {
                                setEditingId(null);
                                setEditPick(new Set());
                              }}
                              disabled={saving}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn--sm"
                              onClick={() => void handleSaveEdit()}
                              disabled={saving}
                            >
                              {saving ? '…' : 'Save'}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost btn--sm"
                            onClick={() => openEdit(g)}
                            disabled={saving}
                          >
                            Edit products
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {expanded ? (
                    <ul className="menu-groups-pick-list menu-groups-pick-list--nested">
                      {sortedProducts.map((p) => (
                        <li key={p.id}>
                          <label className="menu-groups-pick-row">
                            <input
                              type="checkbox"
                              checked={editPick.has(p.id)}
                              onChange={() => toggleEdit(p.id)}
                              disabled={readOnly}
                            />
                            <span>{productName(p)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
