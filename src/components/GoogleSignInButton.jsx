import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useState } from 'react';
import { auth } from '../firebase';
import { formatPhoneAuthError } from '../firebase/authErrors';
import { getUserDocument, upsertSellerUser } from '../services/firestore';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

/**
 * Google sign-in for seller app. Links `users/{uid}` with email/displayName;
 * post-login routing uses `users.sellerId` and phone match.
 */
export function GoogleSignInButton({ className = 'btn btn-ghost auth-submit', disabled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setError('');
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, provider);
      const u = cred.user;
      const existing = await getUserDocument(u.uid);
      await upsertSellerUser(u.uid, {
        phone: u.phoneNumber ?? existing?.phone,
        role: 'seller',
        shopCode: existing?.shopCode ?? null,
        sellerId: existing?.sellerId ?? null,
        email: u.email ?? null,
        displayName: u.displayName ?? null,
        photoURL: u.photoURL ?? null,
        authProvider: 'google',
        authType: 'google',
      });
    } catch (err) {
      setError(formatPhoneAuthError(err) || err?.message || 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      <button
        type="button"
        className={className}
        disabled={busy || disabled}
        onClick={handleClick}
      >
        {busy ? 'Connecting…' : 'Continue with Google'}
      </button>
      {error ? (
        <p className="error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
