/**
 * Firebase web client config — must match Firebase Console → Project settings → Your apps.
 * Vite exposes only `VITE_*` from `.env` (restart dev server after changes).
 */
const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  ...(measurementId ? { measurementId } : {}),
};

function assertConfig() {
  const required = [
    ['VITE_FIREBASE_API_KEY', firebaseConfig.apiKey],
    ['VITE_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
    ['VITE_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
    ['VITE_FIREBASE_STORAGE_BUCKET', firebaseConfig.storageBucket],
    ['VITE_FIREBASE_MESSAGING_SENDER_ID', firebaseConfig.messagingSenderId],
    ['VITE_FIREBASE_APP_ID', firebaseConfig.appId],
  ];
  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    console.error(
      `[Firebase] Missing env: ${missing.join(', ')}. Copy .env.example to .env and fill values.`,
    );
  }
}

assertConfig();

if (import.meta.env.DEV) {
  console.log('[Firebase] Web config loaded:', {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    appId: firebaseConfig.appId,
    storageBucket: firebaseConfig.storageBucket,
    measurementId: firebaseConfig.measurementId ?? '(omitted)',
    apiKeyPrefix: firebaseConfig.apiKey
      ? `${String(firebaseConfig.apiKey).slice(0, 8)}…`
      : '(missing)',
  });
}
