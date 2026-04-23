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
  ownerName: 'Alex Demo',
  phone: '+919999000001',
  address: 'Demo Bazaar, Bengaluru',
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
  demoOrder('demo-o-1', 'new', '+919876543210', 'Riya', [{ name: 'Masala Dosa', price: 80, qty: 2 }], 160, 'app'),
  demoOrder(
    'demo-o-2',
    'confirmed',
    '+919811122233',
    'Sam',
    [{ name: 'Idli', price: 40, qty: 3 }],
    120,
    'app',
  ),
  demoOrder(
    'demo-o-3',
    'preparing',
    '+919900011122',
    'Walk-in',
    [{ name: 'Combo Lunch', price: 199, qty: 1 }],
    199,
    'quick',
  ),
  demoOrder('demo-o-4', 'ready', '+919955566677', 'Meera', [{ name: 'Coffee', price: 30, qty: 2 }], 60, 'app'),
  demoOrder(
    'demo-o-5',
    'completed',
    '+919944433322',
    'Kiran',
    [{ name: 'Parotta', price: 45, qty: 4 }],
    180,
    'app',
  ),
  demoOrder('demo-o-6', 'cancelled', '+919933300011', 'Guest', [{ name: 'Vada', price: 20, qty: 1 }], 20, 'app'),
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
