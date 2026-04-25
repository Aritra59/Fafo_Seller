/**
 * Main heading for the seller shell (shown in the sticky top bar).
 * @param {string} pathname
 */
export function pageTitleFromPath(pathname) {
  const raw = String(pathname ?? '').trim() || '/';
  const p = raw.endsWith('/') && raw.length > 1 ? raw.slice(0, -1) : raw;

  if (p === '/dashboard') return 'Dashboard';
  if (p === '/orders') return 'Orders';
  if (/^\/orders\/[^/]+$/.test(p)) return 'Order';
  if (p === '/menu/add') return 'Add item';
  if (/^\/menu\/edit\/.+/.test(p)) return 'Edit item';
  if (p === '/menu') return 'Menu';
  if (p === '/menu/groups') return 'Menus';
  if (p === '/profile') return 'Profile';
  if (p === '/billing') return 'Billing';
  if (p === '/customers') return 'Customers';
  if (/^\/customers\/.+/.test(p)) return 'Customer';
  if (p === '/analytics') return 'Analytics';
  if (p === '/settings') return 'Settings';
  if (p === '/onboarding') return 'Set up shop';
  if (p === '/demo') return 'Demo';
  return '';
}
