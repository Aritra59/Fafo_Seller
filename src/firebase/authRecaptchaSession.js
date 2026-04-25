import { disposeRecaptchaVerifier } from './phoneRecaptcha';

/** Last phone-auth RecaptchaVerifier so logout can tear it down before next login. */
let sessionVerifier = null;
let sessionContainer = null;

/**
 * @param {import('firebase/auth').RecaptchaVerifier | null} verifier
 * @param {HTMLElement | null} container
 */
export function setAuthRecaptchaSession(verifier, container) {
  if (sessionVerifier && sessionVerifier !== verifier) {
    disposeRecaptchaVerifier(sessionVerifier, sessionContainer);
  }
  sessionVerifier = verifier;
  sessionContainer = container;
}

/**
 * Clear module-held verifier (e.g. logout). Safe if UI already disposed the same instance.
 */
export function clearAuthRecaptchaSession() {
  disposeRecaptchaVerifier(sessionVerifier, sessionContainer);
  sessionVerifier = null;
  sessionContainer = null;
}

/**
 * After local dispose, drop session pointer if it was this verifier (avoids double-clear on logout).
 * @param {import('firebase/auth').RecaptchaVerifier | null} verifier
 */
export function releaseAuthRecaptchaSession(verifier) {
  if (verifier && sessionVerifier === verifier) {
    sessionVerifier = null;
    sessionContainer = null;
  }
}
