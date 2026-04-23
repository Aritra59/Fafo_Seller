/**
 * Build UPI deep link for payment apps (pa, pn, am, cu).
 * @param {{ pa: string, pn?: string, am?: string, cu?: string }} p
 * @returns {string}
 */
export function buildUpiPayUrl({ pa, pn = '', am = '', cu = 'INR' }) {
  const paEnc = encodeURIComponent(String(pa ?? '').trim());
  const pnEnc = encodeURIComponent(String(pn ?? '').trim());
  const amEnc = encodeURIComponent(String(am ?? '').trim());
  const cuEnc = encodeURIComponent(String(cu ?? 'INR').trim());
  return `upi://pay?pa=${paEnc}&pn=${pnEnc}&am=${amEnc}&cu=${cuEnc}`;
}
