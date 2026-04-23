/**
 * Holds the Firebase Phone Auth confirmation result between "Send OTP" and "Verify".
 * (Module singleton — survives re-renders; clear on sign-out or new send.)
 */

let confirmationResult = null;

export function setPhoneConfirmationResult(result) {
  confirmationResult = result;
}

export function getPhoneConfirmationResult() {
  return confirmationResult;
}

export function clearPhoneConfirmationResult() {
  confirmationResult = null;
}

/**
 * Confirm SMS code using the stored confirmation result from signInWithPhoneNumber.
 * @param {string} smsCode
 */
export async function verifyPhoneOtp(smsCode) {
  const conf = confirmationResult;
  if (!conf) {
    throw new Error('No pending verification. Send an OTP first.');
  }
  const digits = String(smsCode ?? '').replace(/\D/g, '');
  if (digits.length < 4) {
    throw new Error('Enter the verification code from your SMS.');
  }
  return conf.confirm(digits);
}
