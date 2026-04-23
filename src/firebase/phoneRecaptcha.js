import { RecaptchaVerifier } from 'firebase/auth';

/**
 * Firebase does not remove reCAPTCHA nodes in `clear()` — empty the node
 * before creating a new RecaptchaVerifier or you get "argument-error" / duplicate render.
 */
export function clearRecaptchaDom(container) {
  if (container) {
    container.innerHTML = '';
  }
}

export function disposeRecaptchaVerifier(verifier, container) {
  if (verifier) {
    try {
      verifier.clear();
    } catch {
      /* already destroyed or DOM gone */
    }
  }
  clearRecaptchaDom(container);
}

/**
 * Visible reCAPTCHA v2 — user must complete before `signInWithPhoneNumber`.
 */
export async function createVisibleRecaptchaVerifier(auth, container, options = {}) {
  if (!container || !container.isConnected) {
    throw new Error('reCAPTCHA container is not in the document.');
  }

  clearRecaptchaDom(container);

  const verifier = new RecaptchaVerifier(auth, container, {
    size: 'normal',
    callback: () => {
      options.onSolved?.();
    },
    'expired-callback': () => {
      options.onExpired?.();
    },
  });

  await verifier.render();
  return verifier;
}

/**
 * Invisible reCAPTCHA — initialize once; `signInWithPhoneNumber` triggers verification when needed.
 * Avoids duplicate visible widgets and matches production phone auth UX.
 */
export async function createInvisibleRecaptchaVerifier(auth, container, options = {}) {
  if (!container || !container.isConnected) {
    throw new Error('reCAPTCHA container is not in the document.');
  }

  clearRecaptchaDom(container);

  const verifier = new RecaptchaVerifier(auth, container, {
    size: 'invisible',
    callback: () => {
      options.onSolved?.();
    },
    'expired-callback': () => {
      options.onExpired?.();
    },
  });

  await verifier.render();
  return verifier;
}
