/**
 * Date ranges for seller analytics. Uses local calendar for "today" (seller device).
 */

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * @typedef {'day' | 'week' | 'month'} AnalyticsPeriod
 */

/**
 * @returns {{ current: { start: Date, end: Date }, previous: { start: Date, end: Date }, label: { current: string, previous: string } }}
 */
export function getRangesForPeriod(period) {
  const now = new Date();
  if (period === 'day') {
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const y = addDays(todayStart, -1);
    return {
      current: { start: todayStart, end: todayEnd },
      previous: { start: startOfDay(y), end: endOfDay(y) },
      label: {
        current: formatShort(todayStart),
        previous: formatShort(y),
      },
    };
  }
  if (period === 'week') {
    const end = endOfDay(now);
    const curStart = startOfDay(addDays(end, -6));
    const prevEnd = addDays(curStart, -1);
    const prevStart = startOfDay(addDays(prevEnd, -6));
    return {
      current: { start: curStart, end },
      previous: { start: prevStart, end: endOfDay(prevEnd) },
      label: {
        current: 'Last 7 days (live)',
        previous: 'Prior 7 days',
      },
    };
  }
  // month: MTD vs same calendar days in previous month
  const y = now.getFullYear();
  const m = now.getMonth();
  const dayOfMonth = now.getDate();
  const curStart = new Date(y, m, 1, 0, 0, 0, 0);
  const curEnd = endOfDay(now);
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  const lastDayPrev = new Date(prevY, prevM + 1, 0).getDate();
  const endD = Math.min(dayOfMonth, lastDayPrev);
  const prevStart = new Date(prevY, prevM, 1, 0, 0, 0, 0);
  const prevEnd = endOfDay(new Date(prevY, prevM, endD, 0, 0, 0, 0));
  return {
    current: { start: curStart, end: curEnd },
    previous: { start: prevStart, end: prevEnd },
    label: {
      current: `MTD through ${formatShort(curEnd)}`,
      previous: `${formatShort(prevStart)} – ${formatShort(prevEnd)}`,
    },
  };
}

function formatShort(d) {
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * @param {Date} t
 * @param {{ start: Date, end: Date }} range
 */
export function isInRange(t, range) {
  const x = t.getTime();
  return x >= range.start.getTime() && x <= range.end.getTime();
}
