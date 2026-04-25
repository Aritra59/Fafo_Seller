import { resolveMenuDays } from '../utils/menuSchedule';

/** Session flag set from Home → "Explore (demo mode)". */
const DEMO_KEY = 'fafo_demo';

export const DEMO_SELLER_ID = 'demo-seller';

const trialEnd = new Date();
trialEnd.setDate(trialEnd.getDate() + 12);

/** Mock seller row (shape close to Firestore `sellers` docs). */
export const DEMO_SELLER = {
  id: DEMO_SELLER_ID,
  sellerMode: 'demo',
  shopName: 'Demo Street Kitchen',
  ownerName: 'Sample Owner',
  phone: '+910000000001',
  address: '123 Sample Lane, Demo City',
  slots: 0,
  isLive: false,
  isBlocked: false,
  trialStart: new Date(),
  trialEnd,
  shopCode: 'DEMO01',
  shopSlug: 'demo-street-kitchen',
  shopUrl: 'https://fafo-buyer.vercel.app/shop/DEMO01',
  publicShopUrl: 'https://fafo-buyer.vercel.app/shop/DEMO01',
  qrUrl: '',
  imageUrl: '',
  openingTime: '09:00',
  closingTime: '22:00',
  deliveryEnabled: true,
  deliveryRules: 'Free above ₹199 · 3 km max',
  upiId: 'demo@upi',
  upiName: 'Demo Kitchen',
  globalDiscountText: '10% off today (demo)',
  globalDiscountPercent: 10,
};

function demoOrder(id, status, buyerPhone, buyerName, items, total, source = 'app') {
  const createdAt = {
    toDate: () => new Date(),
    toMillis: () => Date.now(),
  };
  return {
    id,
    status,
    buyerPhone,
    buyerName,
    items,
    total,
    source,
    createdAt,
    sellerId: DEMO_SELLER_ID,
  };
}

export const DEMO_ORDERS = [
  demoOrder('demo-o-1', 'new', '+910000000101', 'Demo Buyer A', [{ name: 'Masala Dosa', price: 80, qty: 2 }], 160, 'app'),
  demoOrder(
    'demo-o-2',
    'confirmed',
    '+910000000102',
    'Demo Buyer B',
    [{ name: 'Idli', price: 40, qty: 3 }],
    120,
    'app',
  ),
  demoOrder(
    'demo-o-3',
    'preparing',
    '+910000000103',
    'Walk-in (demo)',
    [{ name: 'Combo Lunch', price: 199, qty: 1 }],
    199,
    'quick',
  ),
  demoOrder('demo-o-4', 'ready', '+910000000104', 'Demo Buyer C', [{ name: 'Coffee', price: 30, qty: 2 }], 60, 'app'),
  demoOrder(
    'demo-o-5',
    'completed',
    '+910000000105',
    'Demo Buyer D',
    [{ name: 'Parotta', price: 45, qty: 4 }],
    180,
    'app',
  ),
  demoOrder('demo-o-6', 'cancelled', '+910000000106', 'Demo Guest', [{ name: 'Vada', price: 20, qty: 1 }], 20, 'app'),
];

export const DEMO_PRODUCTS = [
  {
    id: 'demo-p-1',
    sellerId: DEMO_SELLER_ID,
    name: 'Masala Dosa',
    price: 80,
    cuisineCategory: 'South Indian',
    category: 'Breakfast › Classics',
    quantity: 20,
    tags: ['Fast Selling'],
    discountLabel: '₹10 off',
    discountPercent: null,
  },
  {
    id: 'demo-p-2',
    sellerId: DEMO_SELLER_ID,
    name: 'Filter Coffee',
    price: 30,
    cuisineCategory: 'Beverages',
    category: 'Drinks › Hot',
    quantity: 50,
    tags: [],
    discountLabel: null,
    discountPercent: 15,
  },
];

export const DEMO_COMBOS = [
  {
    id: 'demo-c-1',
    sellerId: DEMO_SELLER_ID,
    name: 'Lunch Combo',
    price: 199,
    productIds: ['demo-p-1', 'demo-p-2'],
    imageUrl: '',
  },
];

export const DEMO_MENU_GROUPS = [
  {
    id: 'demo-mg-1',
    sellerId: DEMO_SELLER_ID,
    name: 'Sample menu',
    menuName: 'Sample menu',
    productIds: ['demo-p-1', 'demo-p-2'],
    itemIds: ['demo-p-1', 'demo-p-2'],
    comboIds: ['demo-c-1'],
    schedulePreset: 'all',
    rawDays: [],
    days: resolveMenuDays('all', []),
    startTime: '09:00',
    endTime: '22:00',
    isActive: true,
    active: true,
    manualOverride: false,
    sortOrder: 0,
    slug: 'sample-menu',
  },
];

export const DEMO_GLOBAL_CUISINE_CATEGORIES = [
  { id: 'demo-gcu-1', name: 'South Indian', sortOrder: 1, active: true },
];

export const DEMO_GLOBAL_MENU_CATEGORIES = [
  {
    id: 'demo-gmu-1',
    name: 'Breakfast › Classics',
    sortOrder: 1,
    active: true,
    parentCuisineId: 'demo-gcu-1',
  },
];

export function isDemoExplorer() {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearDemoExplorer() {
  try {
    sessionStorage.removeItem(DEMO_KEY);
  } catch {
    /* ignore */
  }
}

export function isDemoSellerId(sellerId) {
  return String(sellerId ?? '') === DEMO_SELLER_ID;
}
