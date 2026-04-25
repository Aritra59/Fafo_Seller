/** @typedef {{ id: string, name?: string, active?: boolean, isActive?: boolean, days?: unknown, rawDays?: number[], startTime?: string, endTime?: string, sortOrder?: number, schedulePreset?: string }} MenuLike */

export const SCHEDULE_PRESETS = /** @type {const} */ ([
  { id: 'all', label: 'All days' },
  { id: 'weekdays', label: 'Mon–Fri' },
  { id: 'weekend', label: 'Weekend' },
  { id: 'custom', label: 'Custom days' },
]);

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

/**
 * @param {unknown} preset
 * @param {unknown} daysRaw
 * @returns {number[]}
 */
export function resolveMenuDays(preset, daysRaw) {
  const p = String(preset ?? '').toLowerCase();
  if (p === 'weekdays') return [...WEEKDAYS];
  if (p === 'weekend') return [...WEEKEND];
  if (p === 'all' || p === 'alldays') return [...ALL_DAYS];
  const arr = Array.isArray(daysRaw) ? daysRaw : [];
  const out = [];
  for (const x of arr) {
    const n = typeof x === 'number' ? x : Number(x);
    if (Number.isFinite(n) && n >= 0 && n <= 6) out.push(n);
  }
  const uniq = [...new Set(out)].sort((a, b) => a - b);
  if (p === 'custom') return uniq;
  if (!p && uniq.length === 0) return [...ALL_DAYS];
  return uniq;
}

/**
 * @param {string | undefined} s
 * @returns {number | null} minutes from midnight
 */
export function parseTimeToMinutes(s) {
  const str = String(s ?? '').trim();
  if (!str) return null;
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * @param {number | null} mins
 * @returns {string}
 */
export function formatMinutesAs12h(mins) {
  if (mins == null || !Number.isFinite(mins)) return '—';
  let h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const am = h < 12;
  let hr = h % 12;
  if (hr === 0) hr = 12;
  const mm = m.toString().padStart(2, '0');
  return `${hr}:${mm}${am ? 'am' : 'pm'}`;
}

/**
 * @param {MenuLike} menu
 * @param {Date} [now]
 * @returns {boolean}
 */
export function menuIsActiveFlag(menu) {
  if (!menu) return false;
  if (menu.active === false) return false;
  if (menu.isActive === false) return false;
  return true;
}

/**
 * @param {MenuLike} menu
 * @param {Date} [now]
 */
export function menuMatchesSchedule(menu, now = new Date()) {
  if (!menuIsActiveFlag(menu)) return false;
  const preset = String(menu.schedulePreset ?? '').toLowerCase();
  const days = resolveMenuDays(preset, menu.days);
  const dow = now.getDay();
  if (preset === 'custom') {
    if (days.length === 0) return false;
    if (!days.includes(dow)) return false;
  } else if (days.length > 0 && days.length < 7 && !days.includes(dow)) {
    return false;
  }

  const start = parseTimeToMinutes(menu.startTime);
  const end = parseTimeToMinutes(menu.endTime);
  if (start == null || end == null) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (end >= start) {
    return cur >= start && cur <= end;
  }
  return cur >= start || cur <= end;
}

/**
 * @param {MenuLike[]} menus
 * @param {Date} [now]
 * @returns {MenuLike | null}
 */
export function pickScheduledMenu(menus, now = new Date()) {
  const rows = Array.isArray(menus) ? menus.filter((m) => m && menuIsActiveFlag(m)) : [];
  const matches = rows.filter((m) => menuMatchesSchedule(m, now));
  if (matches.length === 0) return null;
  matches.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  return matches[0];
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * @param {MenuLike} menu
 * @returns {string}
 */
export function formatMenuCardSchedule(menu) {
  const preset = String(menu?.schedulePreset ?? '').toLowerCase() || 'all';
  let dayPart = 'All days';
  if (preset === 'weekdays') dayPart = 'Mon–Fri';
  else if (preset === 'weekend') dayPart = 'Weekend';
  else if (preset === 'custom' && Array.isArray(menu.rawDays) && menu.rawDays.length) {
    dayPart = [...new Set(menu.rawDays)]
      .filter((n) => n >= 0 && n <= 6)
      .sort((a, b) => a - b)
      .map((d) => DAY_LABELS[d])
      .join(', ');
  }
  const sm = parseTimeToMinutes(menu?.startTime);
  const em = parseTimeToMinutes(menu?.endTime);
  if (sm == null || em == null) {
    return `${dayPart} · All day`;
  }
  return `${dayPart} · ${formatMinutesAs12h(sm)}–${formatMinutesAs12h(em)}`;
}
