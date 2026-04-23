/**
 * Turn Firestore / JSON / string timestamps into a JS time in ms, or null.
 * Handles: Firestore Timestamp, {seconds,nanoseconds}, ISO strings, epoch ms, legacy fields.
 */
export function normalizeToMs(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string' && !value.trim()) {
    return null;
  }
  if (typeof value === 'string') {
    const t = new Date(value).getTime();
    if (Number.isFinite(t) && !Number.isNaN(t)) {
      return t;
    }
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      try {
        const d = value.toDate();
        if (d instanceof Date && !Number.isNaN(d.getTime())) {
          return d.getTime();
        }
      } catch {
        /* continue */
      }
    }
    if (typeof value.seconds === 'number') {
      return value.seconds * 1000 + (typeof value.nanoseconds === 'number' ? value.nanoseconds / 1e6 : 0);
    }
    if (typeof value._seconds === 'number') {
      return (
        value._seconds * 1000 + (typeof value._nanoseconds === 'number' ? value._nanoseconds / 1e6 : 0)
      );
    }
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 1e12) {
      return value * 1000;
    }
    return value;
  }
  return null;
}

const PRIMARY_KEYS = ['createdAt', 'created_at', 'orderDate', 'date'];

/**
 * Prefer createdAt, then other known keys, then updatedAt (if nothing else set).
 * @param {object} order
 * @param {{ allowUpdatedFallback?: boolean }} [opt]
 * @returns {number | null}
 */
export function getOrderTimeMsForAnalytics(order, { allowUpdatedFallback = true } = {}) {
  if (!order || typeof order !== 'object') {
    return null;
  }
  for (const k of PRIMARY_KEYS) {
    const ms = normalizeToMs(order[k]);
    if (ms != null) {
      return ms;
    }
  }
  if (allowUpdatedFallback) {
    const u = normalizeToMs(order.updatedAt);
    if (u != null) {
      return u;
    }
  }
  return null;
}
