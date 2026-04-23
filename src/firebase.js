/**
 * Re-export Firebase app singletons (same instance as `src/firebase/index.js`).
 * Prefer: `import { db, auth, storage } from '../firebase'`
 */
export { app, auth, db, storage } from './firebase/index.js';
