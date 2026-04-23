/**
 * User-facing messages for Firebase Auth errors (phone / reCAPTCHA).
 */
export function formatPhoneAuthError(err) {
  const code = err?.code ?? '';
  const fallback = err?.message ?? 'Something went wrong.';

  const map = {
    'auth/invalid-app-credential':
      'Verification failed (invalid app credential). (1) Confirm .env matches Firebase Console exactly and restart Vite. (2) Authentication → Phone: enabled. (3) Authentication → Settings → Authorized domains: add localhost (and 127.0.0.1) for dev. (4) Google Cloud → APIs & Services → Credentials → Browser API key: either “Application restrictions: None” for testing, or HTTP referrers including http://localhost:* — key must allow Identity Toolkit API. (5) Disable ad blockers / try another browser (reCAPTCHA).',
    'auth/captcha-check-failed':
      'reCAPTCHA could not verify this browser. Refresh the page, disable ad blockers for this site, and try again.',
    'auth/too-many-requests':
      'Too many attempts. Wait a few minutes before requesting another code.',
    'auth/quota-exceeded':
      'SMS quota exceeded for this project. Try again later or contact support.',
    'auth/missing-phone-number': 'Enter a phone number.',
    'auth/invalid-phone-number':
      'Invalid phone number. Use international format, e.g. +15551234567.',
    'auth/invalid-verification-code': 'That code is incorrect. Try again.',
    'auth/code-expired': 'This code has expired. Request a new one.',
    'auth/session-expired': 'This session expired. Request a new code.',
    'auth/network-request-failed':
      'Network error. Check your connection and try again.',
  };

  return map[code] ?? fallback;
}
