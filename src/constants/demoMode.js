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

/** Mirrors admin `itemCategories` collection — demo explorer only. */
export const DEMO_GLOBAL_ITEM_CATEGORIES = [
  { id: 'demo-iic-food', name: 'Food', sortOrder: 1, active: true },
  { id: 'demo-iic-tea', name: 'Tea', sortOrder: 2, active: true, itemType: 'Tea & coffee' },
  { id: 'demo-iic-coffee', name: 'Coffee', sortOrder: 3, active: true, itemType: 'Tea & coffee' },
  { id: 'demo-iic-drinks', name: 'Drinks', sortOrder: 4, active: true, itemType: 'Drinks' },
];

export const DEMO_PRODUCTS = [
  {
    id: 'demo-p-1',
    sellerId: DEMO_SELLER_ID,
    name: 'Masala Dosa',
    price: 80,
    cuisineCategory: 'South Indian',
    category: 'Breakfast › Classics › Plates',
    quantity: 20,
    itemCategoryId: 'demo-iic-food',
    itemCategoryName: 'Food',
    itemType: 'Food',
    tags: ['Fast Selling'],
    discountLabel: '₹10 off',
    discountPercent: null,
  },
  {
    id: 'demo-p-2',
    sellerId: DEMO_SELLER_ID,
    name: 'Filter Coffee',
    price: 30,
    cuisineCategory: 'South Indian',
    category: 'Breakfast › Classics › Coffee',
    quantity: 50,
    itemCategoryId: 'demo-iic-coffee',
    itemCategoryName: 'Coffee',
    itemType: 'Tea & coffee',
    tags: [],
    discountLabel: null,
    discountPercent: 15,
  },
];

/** Sample catalog rows for master list UX in demo explorer (read-only). */
export const DEMO_MASTER_PRODUCTS = [
  {
    id: 'demo-master-1',
    name: 'Ginger chai',
    normalizedName: 'ginger chai',
    itemType: 'Tea & coffee',
    tags: ['bestseller'],
    price: 25,
    cuisineCategoryId: 'demo-gcu-1',
    cuisineCategoryName: 'South Indian',
    menuCategoryId: 'demo-gmu-1',
    menuCategoryName: 'Breakfast › Classics',
    itemCategoryId: 'demo-iic-tea',
    itemCategoryName: 'Tea',
  },
  {
    id: 'demo-master-2',
    name: 'Sweet lime soda',
    normalizedName: 'sweet lime soda',
    itemType: 'Drinks',
    tags: ['cooling'],
    price: 40,
    cuisineCategoryId: 'demo-gcu-1',
    cuisineCategoryName: 'South Indian',
    menuCategoryId: 'demo-gmu-1',
    menuCategoryName: 'Breakfast › Classics',
    itemCategoryId: 'demo-iic-drinks',
    itemCategoryName: 'Drinks',
  },
];

export const DEMO_GLOBAL_TAGS = [
  { id: 'demo-gtg-1', name: 'bestseller', sortOrder: 1, active: true },
  { id: 'demo-gtg-2', name: 'spicy', sortOrder: 2, active: true },
  { id: 'demo-gtg-3', name: 'Fast Selling', sortOrder: 3, active: true },
];

export const DEMO_GLOBAL_ITEM_TYPES = [
  { id: 'demo-git-1', name: 'Food', sortOrder: 1, active: true },
  { id: 'demo-git-2', name: 'Tea & coffee', sortOrder: 2, active: true },
  { id: 'demo-git-3', name: 'Drinks', sortOrder: 3, active: true },
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
