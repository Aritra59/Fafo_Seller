/** Platform UPI for FaFo subscription / balance payments (seller copies this in Billing). */
export const FAFO_PLATFORM_UPI = 'arun79cg@oksbi';

/** WhatsApp support (digits only for wa.me). */
export const FAFO_BILLING_SUPPORT_WA = '919911437353';

export const FAFO_BILLING_WA_PREFILL =
  'Hello, I have paid FaFo billing. Please verify.';

export const FAFO_PLAN_OPTIONS = [
  { id: 'starter', label: 'Starter', price: 99, period: 'month', note: 'Monthly' },
  { id: 'growth', label: 'Growth', price: 249, period: 'month', note: 'Monthly' },
  { id: 'daily', label: 'Pay as you sell', price: 2, period: 'day', note: 'Per day' },
];
