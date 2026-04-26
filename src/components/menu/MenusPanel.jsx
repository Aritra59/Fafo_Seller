import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Eye, Pause, Pencil, Play, Trash2, X } from 'lucide-react';
import {
  createMenuGroup,
  deleteMenuGroup,
  saveMenuDefinition,
  subscribeMenuGroupsBySellerId,
  updateMenuGroupMeta,
} from '../../services/menuGroupsService';
import { SCHEDULE_PRESETS, formatMenuCardScheduleLines, menuIsActiveFlag } from '../../utils/menuSchedule';
import { SellerMenuPreview } from './SellerMenuPreview';
import { CompactTimeInput } from '../CompactTimeInput';

function productName(p) {
  const n = p?.name ?? p?.title;
  return typeof n === 'string' && n.trim() ? n.trim() : 'Untitled';
}

function comboTitle(c) {
  const n = c?.name ?? c?.title;
  return typeof n === 'string' && n.trim() ? n.trim() : 'Untitled combo';
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

function countCombos(group) {
  const c = group.comboIds;
  return Array.isArray(c) ? c.length : 0;
}

const CUSTOM_DAY_DEFS = [
  { d: 1, label: 'Mo' },
  { d: 2, label: 'Tu' },
  { d: 3, label: 'We' },
  { d: 4, label: 'Th' },
  { d: 5, label: 'Fr' },
  { d: 6, label: 'Sa' },
  { d: 0, label: 'Su' },
];

function emptyCreateForm() {
  return {
    name: '',
    preset: 'all',
    customDays: new Set(),
    startTime: '07:00',
    endTime: '11:00',
    itemPick: new Set(),
    comboPick: new Set(),
  };
}

function emptyEditForm() {
  return {
    name: '',
    preset: 'all',
    customDays: new Set(),
    startTime: '',
    endTime: '',
    itemPick: new Set(),
    comboPick: new Set(),
  };
}

/**
 * @param {object} props
 * @param {string} props.sellerId
 * @param {object[]} [props.products]
 * @param {object[]} [props.combos]
 * @param {boolean} [props.readOnly]
 * @param {string} [props.menuSessionOverrideGroupId] Dashboard manual session menu id
 * @param {Set<string> | null} [props.allowedMenuGroupIds] When set, only these menu ids are listed
 */
export const MenusPanel = forwardRef(function MenusPanel(
  {
    sellerId,
    products = [],
    combos = [],
    readOnly = false,
    menuSessionOverrideGroupId = '',
    allowedMenuGroupIds = null,
  },
  ref,
) {
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [create, setCreate] = useState(() => emptyCreateForm());
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [previewGroup, setPreviewGroup] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState(() => emptyEditForm());

  useEffect(() => {
    if (!sellerId) {
      setMenus([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return subscribeMenuGroupsBySellerId(
      sellerId,
      (rows) => {
        setMenus(rows);
        setLoading(false);
        setErr('');
      },
      (e) => {
        setErr(e?.message ?? 'Could not load menus.');
        setMenus([]);
        setLoading(false);
      },
    );
  }, [sellerId]);

  const sortedProducts = useMemo(
    () =>
      [...products].sort((a, b) =>
        productName(a).localeCompare(productName(b), undefined, { sensitivity: 'base' }),
      ),
    [products],
  );

  const sortedCombos = useMemo(
    () =>
      [...combos].sort((a, b) =>
        comboTitle(a).localeCompare(comboTitle(b), undefined, { sensitivity: 'base' }),
      ),
    [combos],
  );

  const visibleMenus = useMemo(() => {
    if (allowedMenuGroupIds == null) return menus;
    if (allowedMenuGroupIds.size === 0) return [];
    return menus.filter((g) => allowedMenuGroupIds.has(String(g.id)));
  }, [menus, allowedMenuGroupIds]);

  useImperativeHandle(
    ref,
    () => ({
      openCreateSheet() {
        if (readOnly) return;
        setErr('');
        setCreate(emptyCreateForm());
        setCreateSheetOpen(true);
      },
    }),
    [readOnly],
  );

  function openEdit(g) {
    setEditingId(g.id);
    const itemIds = pickItemIdsForMenu(g, products);
    const comboIds = new Set(Array.isArray(g.comboIds) ? g.comboIds.map((x) => String(x)) : []);
    const preset = String(g.schedulePreset || 'all').toLowerCase() || 'all';
    const raw = Array.isArray(g.rawDays) && g.rawDays.length ? g.rawDays : [];
    setEdit({
      name: String(g.name || g.menuName || '').trim(),
      preset: preset === 'weekdays' || preset === 'weekend' || preset === 'custom' ? preset : 'all',
      customDays: new Set(raw),
      startTime: typeof g.startTime === 'string' && g.startTime ? g.startTime : '',
      endTime: typeof g.endTime === 'string' && g.endTime ? g.endTime : '',
      itemPick: itemIds,
      comboPick: comboIds,
    });
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (readOnly || !sellerId) return;
    const name = create.name.trim();
    if (!name) {
      setErr('Enter a menu name.');
      return;
    }
    if (create.preset === 'custom' && create.customDays.size === 0) {
      setErr('Pick at least one day for a custom schedule.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const nextOrder = menus.length ? Math.max(...menus.map((m) => Number(m.sortOrder) || 0), 0) + 1 : 0;
      await createMenuGroup(sellerId, {
        name,
        itemIds: [...create.itemPick],
        comboIds: [...create.comboPick],
        schedulePreset: create.preset,
        days: create.preset === 'custom' ? [...create.customDays] : [],
        startTime: create.startTime || '',
        endTime: create.endTime || '',
        sortOrder: nextOrder,
        active: true,
      });
      setCreate(emptyCreateForm());
      setCreateSheetOpen(false);
    } catch (ex) {
      setErr(ex?.message ?? 'Could not create menu.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (readOnly || !sellerId || !editingId) return;
    const nameTrim = edit.name.trim();
    if (!nameTrim) {
      setErr('Enter a menu name.');
      return;
    }
    if (edit.preset === 'custom' && edit.customDays.size === 0) {
      setErr('Pick at least one day for a custom schedule.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await saveMenuDefinition(sellerId, editingId, {
        name: nameTrim,
        itemIds: [...edit.itemPick],
        comboIds: [...edit.comboPick],
        schedulePreset: edit.preset,
        days: edit.preset === 'custom' ? [...edit.customDays] : [],
        startTime: edit.startTime,
        endTime: edit.endTime,
      });
      setEditingId(null);
      setEdit(emptyEditForm());
    } catch (ex) {
      setErr(ex?.message ?? 'Could not save menu.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(g) {
    if (readOnly || !sellerId) return;
    if (!window.confirm(`Delete “${g.name || g.menuName}”? Items and combos stay in your catalog.`)) return;
    setSaving(true);
    setErr('');
    try {
      await deleteMenuGroup(sellerId, g.id);
      if (editingId === g.id) {
        setEditingId(null);
        setEdit(emptyEditForm());
      }
    } catch (ex) {
      setErr(ex?.message ?? 'Could not delete.');
    } finally {
      setSaving(false);
    }
  }

  async function setActive(g, on) {
    if (readOnly || !sellerId) return;
    setSaving(true);
    setErr('');
    try {
      await updateMenuGroupMeta(sellerId, g.id, { active: on, isActive: on });
    } catch (ex) {
      setErr(ex?.message ?? 'Could not update status.');
    } finally {
      setSaving(false);
    }
  }

  function toggleCreateItem(id) {
    if (readOnly) return;
    setCreate((prev) => {
      const n = new Set(prev.itemPick);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { ...prev, itemPick: n };
    });
  }

  function toggleCreateCombo(id) {
    if (readOnly) return;
    setCreate((prev) => {
      const n = new Set(prev.comboPick);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { ...prev, comboPick: n };
    });
  }

  function toggleEditItem(id) {
    if (readOnly) return;
    setEdit((prev) => {
      const n = new Set(prev.itemPick);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { ...prev, itemPick: n };
    });
  }

  function toggleEditCombo(id) {
    if (readOnly) return;
    setEdit((prev) => {
      const n = new Set(prev.comboPick);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return { ...prev, comboPick: n };
    });
  }

  function toggleCustomDay(formSetter, day) {
    formSetter((prev) => {
      const n = new Set(prev.customDays);
      if (n.has(day)) n.delete(day);
      else n.add(day);
      return { ...prev, customDays: n };
    });
  }

  if (!sellerId) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Sign in to manage menus.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Loading menus…
      </p>
    );
  }

  return (
    <div className="menus-panel stack">
      <p className="menus-panel__intro menus-panel__intro--compact muted" style={{ margin: 0 }}>
        Time-based menus for buyers. Dashboard picks the active session from your schedule.
      </p>

      {err ? (
        <p className="error" style={{ margin: 0, fontSize: '0.9rem' }}>
          {err}
        </p>
      ) : null}

      {readOnly ? (
        <p className="muted card menus-panel__readonly" style={{ margin: 0 }}>
          Demo mode — explore sample menus. Sign in to edit Firestore data.
        </p>
      ) : null}

      {!readOnly && createSheetOpen ? (
        <div className="menus-panel-overlay" role="presentation">
          <button
            type="button"
            className="menus-panel-overlay__backdrop"
            aria-label="Close"
            disabled={saving}
            onClick={() => !saving && setCreateSheetOpen(false)}
          />
          <div className="menus-panel-sheet card" role="dialog" aria-modal="true" aria-labelledby="menus-create-title">
            <div className="menus-panel-sheet__head">
              <h2 id="menus-create-title" className="menus-panel__create-title" style={{ margin: 0 }}>
                Create menu
              </h2>
              <button type="button" className="btn btn-ghost btn--sm" disabled={saving} onClick={() => setCreateSheetOpen(false)}>
                Close
              </button>
            </div>
        <form className="menus-panel__create menus-panel__create--sheet" onSubmit={handleCreate}>
          <label className="label" htmlFor="new-menu-name">
            Menu name
          </label>
          <input
            id="new-menu-name"
            className="input"
            value={create.name}
            onChange={(e) => setCreate((c) => ({ ...c, name: e.target.value }))}
            placeholder="e.g. Breakfast, Weekend Special"
            maxLength={80}
            autoComplete="off"
          />

          <p className="label" style={{ margin: '0.75rem 0 0.35rem' }}>
            Schedule
          </p>
          <div className="menus-panel__segment" role="group" aria-label="Schedule preset">
            {SCHEDULE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`menus-panel__segment-btn${create.preset === p.id ? ' menus-panel__segment-btn--on' : ''}`}
                onClick={() => setCreate((c) => ({ ...c, preset: p.id }))}
              >
                {p.label}
              </button>
            ))}
          </div>

          {create.preset === 'custom' ? (
            <div className="menus-panel__day-row" aria-label="Custom days">
              {CUSTOM_DAY_DEFS.map(({ d, label }) => (
                <button
                  key={`d-${d}`}
                  type="button"
                  className={`menus-panel__day-pill${create.customDays.has(d) ? ' menus-panel__day-pill--on' : ''}`}
                  onClick={() => toggleCustomDay(setCreate, d)}
                  aria-pressed={create.customDays.has(d)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="menus-panel__time-row">
            <label className="menus-panel__time-field">
              <span className="label">Start time</span>
              <CompactTimeInput
                id="menu-create-start"
                value={create.startTime}
                onChange={(v) => setCreate((c) => ({ ...c, startTime: v }))}
                disabled={saving}
                hourLabel="Menu start hour"
                minuteLabel="Menu start minute"
              />
            </label>
            <label className="menus-panel__time-field">
              <span className="label">End time</span>
              <CompactTimeInput
                id="menu-create-end"
                value={create.endTime}
                onChange={(v) => setCreate((c) => ({ ...c, endTime: v }))}
                disabled={saving}
                hourLabel="Menu end hour"
                minuteLabel="Menu end minute"
              />
            </label>
          </div>

          <p className="label" style={{ margin: '0.75rem 0 0.35rem' }}>
            Add items
          </p>
          <ul className="menus-panel__pick">
            {sortedProducts.length === 0 ? (
              <li className="muted">No items yet. Add items on the Items tab.</li>
            ) : (
              sortedProducts.map((p) => (
                <li key={p.id}>
                  <label className="menus-panel__pick-row">
                    <input
                      type="checkbox"
                      checked={create.itemPick.has(p.id)}
                      onChange={() => toggleCreateItem(p.id)}
                    />
                    <span>{productName(p)}</span>
                  </label>
                </li>
              ))
            )}
          </ul>

          <p className="label" style={{ margin: '0.75rem 0 0.35rem' }}>
            Add combos
          </p>
          <ul className="menus-panel__pick">
            {sortedCombos.length === 0 ? (
              <li className="muted">No combos yet. Create combos on the Combos tab.</li>
            ) : (
              sortedCombos.map((c) => (
                <li key={c.id}>
                  <label className="menus-panel__pick-row">
                    <input
                      type="checkbox"
                      checked={create.comboPick.has(c.id)}
                      onChange={() => toggleCreateCombo(c.id)}
                    />
                    <span>{comboTitle(c)}</span>
                  </label>
                </li>
              ))
            )}
          </ul>

          <button type="submit" className="btn btn-primary menus-panel__submit" disabled={saving || !create.name.trim()}>
            {saving ? 'Saving…' : 'Save menu'}
          </button>
        </form>
          </div>
        </div>
      ) : null}

      {previewGroup ? (
        <SellerMenuPreview
          menuGroup={previewGroup}
          products={products}
          combos={combos}
          onClose={() => setPreviewGroup(null)}
          sessionBanner={
            menuSessionOverrideGroupId &&
            String(previewGroup.id) === String(menuSessionOverrideGroupId).trim()
              ? 'This menu is pinned on the dashboard — buyers open your shop here until you switch Menu session to Auto (schedule).'
              : ''
          }
        />
      ) : null}

      <section className="menus-panel__list-section">
        <h2 className="menus-panel__list-title">Your menus</h2>
        {menus.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No menus yet. Use the <strong className="menus-panel__inline-strong">+</strong> button.
          </p>
        ) : visibleMenus.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No menus match your search or category filters.
          </p>
        ) : (
          <ul className="menus-panel__card-list">
            {visibleMenus.map((g) => {
              const nItems = pickItemIdsForMenu(g, products).size;
              const nCombos = countCombos(g);
              const active = menuIsActiveFlag(g);
              const expanded = editingId === g.id;
              const { dayLine, timeLine } = formatMenuCardScheduleLines(g);
              return (
                <li key={g.id}>
                  <article
                    className={`menus-panel__card menus-panel__card--dash${active ? '' : ' menus-panel__card--inactive'}${
                      expanded ? ' menus-panel__card--expanded' : ''
                    }`}
                  >
                    {expanded ? (
                      <>
                        <div className="menus-panel__card-head menus-panel__card-head--editing">
                          <h3 className="menus-panel__card-name menus-panel__card-name--editing">
                            {g.name || g.menuName}
                          </h3>
                          <div
                            className="menus-panel__card-toolbar menus-panel__card-toolbar--editing"
                            role="toolbar"
                            aria-label="Save or cancel"
                          >
                            <button
                              type="button"
                              className="menus-panel__card-iconbtn menus-panel__card-iconbtn--header"
                              disabled={saving}
                              aria-label="Cancel editing"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="menus-panel__iconbtn-svg" size={19} strokeWidth={2.1} aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn--sm menus-panel__toolbar-save"
                              disabled={saving}
                              onClick={() => void handleSaveEdit()}
                            >
                              {saving ? '…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="menus-panel__card-surface">
                        <header className="menus-panel__card-top">
                          <div className="menus-panel__card-top-left">
                            <span
                              className={
                                active
                                  ? 'menus-panel__status-dot menus-panel__status-dot--active'
                                  : 'menus-panel__status-dot menus-panel__status-dot--inactive'
                              }
                              title={active ? 'Active' : 'Inactive'}
                              role="img"
                              aria-label={active ? 'Active' : 'Inactive'}
                            />
                            <h3 className="menus-panel__card-name">{g.name || g.menuName}</h3>
                          </div>
                          {!readOnly ? (
                            <div className="menus-panel__card-top-actions" role="group" aria-label="Quick actions">
                              <button
                                type="button"
                                className="menus-panel__card-iconbtn menus-panel__card-iconbtn--header"
                                disabled={saving}
                                title="Preview as buyers see it"
                                aria-label="Preview menu"
                                onClick={() => setPreviewGroup(g)}
                              >
                                <Eye className="menus-panel__iconbtn-svg" size={18} strokeWidth={2.1} aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="menus-panel__card-iconbtn menus-panel__card-iconbtn--header"
                                disabled={saving}
                                title="Edit menu"
                                aria-label="Edit menu"
                                onClick={() => openEdit(g)}
                              >
                                <Pencil className="menus-panel__iconbtn-svg" size={18} strokeWidth={2.1} aria-hidden />
                              </button>
                            </div>
                          ) : null}
                        </header>

                        <div className="menus-panel__card-schedule">
                          <p className="menus-panel__card-schedule-line menus-panel__card-schedule-line--days muted">
                            <span aria-hidden>⏰</span> {dayLine}
                          </p>
                          <p className="menus-panel__card-schedule-line menus-panel__card-schedule-line--time muted">
                            {timeLine}
                          </p>
                        </div>

                        <div className="menus-panel__card-badges" aria-label="Menu contents">
                          <span className="menus-panel__stat-pill">
                            <span aria-hidden>🍽</span> {nItems} {nItems === 1 ? 'Item' : 'Items'}
                          </span>
                          <span className="menus-panel__stat-pill">
                            <span aria-hidden>🥤</span> {nCombos} {nCombos === 1 ? 'Combo' : 'Combos'}
                          </span>
                        </div>

                        <div className="menus-panel__card-actions" role="toolbar" aria-label="Menu actions">
                          <button
                            type="button"
                            className="menus-panel__action-col"
                            disabled={saving}
                            title="View — preview as buyers see it"
                            onClick={() => setPreviewGroup(g)}
                          >
                            <span className="menus-panel__action-ico">
                              <Eye size={20} strokeWidth={2.1} aria-hidden />
                            </span>
                            <span className="menus-panel__action-lbl">View</span>
                          </button>
                          <button
                            type="button"
                            className="menus-panel__action-col"
                            disabled={saving || readOnly}
                            title="Edit menu"
                            onClick={() => openEdit(g)}
                          >
                            <span className="menus-panel__action-ico">
                              <Pencil size={20} strokeWidth={2.1} aria-hidden />
                            </span>
                            <span className="menus-panel__action-lbl">Edit</span>
                          </button>
                          {active ? (
                            <button
                              type="button"
                              className="menus-panel__action-col menus-panel__action-col--danger"
                              disabled={saving || readOnly}
                              title="Deactivate menu"
                              onClick={() => void setActive(g, false)}
                            >
                              <span className="menus-panel__action-ico">
                                <Pause size={20} strokeWidth={2.1} aria-hidden />
                              </span>
                              <span className="menus-panel__action-lbl">Disable</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="menus-panel__action-col menus-panel__action-col--enable"
                              disabled={saving || readOnly}
                              title="Activate menu"
                              onClick={() => void setActive(g, true)}
                            >
                              <span className="menus-panel__action-ico">
                                <Play size={20} strokeWidth={2.1} aria-hidden />
                              </span>
                              <span className="menus-panel__action-lbl">Enable</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {expanded ? (
                      <div className="menus-panel__editor stack">
                        <label className="label" htmlFor={`edit-name-${g.id}`}>
                          Menu name
                        </label>
                        <input
                          id={`edit-name-${g.id}`}
                          className="input"
                          value={edit.name}
                          onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))}
                          maxLength={80}
                        />
                        <p className="label" style={{ margin: '0.5rem 0 0.25rem' }}>
                          Schedule
                        </p>
                        <div className="menus-panel__segment" role="group">
                          {SCHEDULE_PRESETS.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className={`menus-panel__segment-btn${edit.preset === p.id ? ' menus-panel__segment-btn--on' : ''}`}
                              onClick={() => setEdit((x) => ({ ...x, preset: p.id }))}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                        {edit.preset === 'custom' ? (
                          <div className="menus-panel__day-row">
                            {CUSTOM_DAY_DEFS.map(({ d, label }) => (
                              <button
                                key={`d-${d}`}
                                type="button"
                                className={`menus-panel__day-pill${edit.customDays.has(d) ? ' menus-panel__day-pill--on' : ''}`}
                                onClick={() => toggleCustomDay(setEdit, d)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <div className="menus-panel__time-row">
                          <label className="menus-panel__time-field">
                            <span className="label">Start time</span>
                            <CompactTimeInput
                              id={`menu-edit-start-${g.id}`}
                              value={edit.startTime}
                              onChange={(v) => setEdit((x) => ({ ...x, startTime: v }))}
                              disabled={readOnly || saving}
                              hourLabel="Menu start hour"
                              minuteLabel="Menu start minute"
                            />
                          </label>
                          <label className="menus-panel__time-field">
                            <span className="label">End time</span>
                            <CompactTimeInput
                              id={`menu-edit-end-${g.id}`}
                              value={edit.endTime}
                              onChange={(v) => setEdit((x) => ({ ...x, endTime: v }))}
                              disabled={readOnly || saving}
                              hourLabel="Menu end hour"
                              minuteLabel="Menu end minute"
                            />
                          </label>
                        </div>
                        <p className="label" style={{ margin: '0.5rem 0 0.25rem' }}>
                          Items
                        </p>
                        <ul className="menus-panel__pick menus-panel__pick--scroll">
                          {sortedProducts.map((p) => (
                            <li key={p.id}>
                              <label className="menus-panel__pick-row">
                                <input type="checkbox" checked={edit.itemPick.has(p.id)} onChange={() => toggleEditItem(p.id)} />
                                <span>{productName(p)}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                        <p className="label" style={{ margin: '0.5rem 0 0.25rem' }}>
                          Combos
                        </p>
                        <ul className="menus-panel__pick menus-panel__pick--scroll">
                          {sortedCombos.map((c) => (
                            <li key={c.id}>
                              <label className="menus-panel__pick-row">
                                <input type="checkbox" checked={edit.comboPick.has(c.id)} onChange={() => toggleEditCombo(c.id)} />
                                <span>{comboTitle(c)}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                        {!readOnly ? (
                          <div className="menus-panel__editor-danger">
                            <button
                              type="button"
                              className="btn btn-ghost btn--sm menus-panel__del menus-panel__editor-delete-btn"
                              disabled={saving}
                              onClick={() => void handleDelete(g)}
                            >
                              <Trash2 className="menus-panel__iconbtn-svg" size={16} strokeWidth={2.1} aria-hidden />
                              Delete menu
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
});

MenusPanel.displayName = 'MenusPanel';
