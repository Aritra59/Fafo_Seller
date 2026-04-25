import { signInWithPhoneNumber, signOut } from 'firebase/auth';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { auth } from '../firebase';
import { formatPhoneAuthError } from '../firebase/authErrors';
import {
  installAuthFetchDebugLogger,
  logRecentAuthResourceUrls,
} from '../firebase/authNetworkDebug';
import {
  clearPhoneConfirmationResult,
  setPhoneConfirmationResult,
  verifyPhoneOtp,
} from '../firebase/phoneConfirmation';
import {
  releaseAuthRecaptchaSession,
  setAuthRecaptchaSession,
} from '../firebase/authRecaptchaSession';
import {
  clearRecaptchaDom,
  createInvisibleRecaptchaVerifier,
  disposeRecaptchaVerifier,
} from '../firebase/phoneRecaptcha';
import { persistSellerId } from '../constants/session';
import { getSellerByPhone, upsertIndiaPhoneAuthUser } from '../services/firestore';

const IN_MOBILE_LEN = 10;
const OTP_LEN = 6;

function logPhoneAuth(event, detail = {}) {
  console.info('[PhoneAuth]', event, detail);
}

function toIndiaE164(digits10) {
  return `+91${digits10}`;
}

function disposeVerifierSession(verifierRef, getContainer) {
  const v = verifierRef.current;
  const c = getContainer();
  disposeRecaptchaVerifier(v, c);
  verifierRef.current = null;
  releaseAuthRecaptchaSession(v);
}

export function PhoneSignIn({ onSuccess, phoneStepFooter = null }) {
  const reactId = useId().replace(/:/g, '');
  const containerId = `fafo-recaptcha-${reactId}`;

  const containerRef = useRef(null);
  const verifierRef = useRef(null);
  const sendOtpLockRef = useRef(false);

  const [localDigits, setLocalDigits] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verifierTick, setVerifierTick] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);

  const getContainer = useCallback(() => {
    return containerRef.current ?? document.getElementById(containerId);
  }, [containerId]);

  useEffect(() => {
    installAuthFetchDebugLogger();
  }, []);

  useEffect(() => {
    return () => {
      logPhoneAuth('verifier:dispose (unmount)');
      disposeVerifierSession(verifierRef, getContainer);
      clearPhoneConfirmationResult();
    };
  }, [getContainer]);

  useEffect(() => {
    if (step !== 'phone') {
      return undefined;
    }

    const container = containerRef.current;
    if (!container?.isConnected) {
      return undefined;
    }

    let cancelled = false;

    const prevVerifier = verifierRef.current;
    disposeRecaptchaVerifier(prevVerifier, container);
    verifierRef.current = null;
    releaseAuthRecaptchaSession(prevVerifier);

    (async () => {
      try {
        logPhoneAuth('verifier:creating (invisible)', { verifierTick });
        await new Promise((r) => {
          requestAnimationFrame(() => r());
        });
        if (cancelled || !container.isConnected) {
          return;
        }
        const verifier = await createInvisibleRecaptchaVerifier(auth, container, {
          onSolved: () => {
            logPhoneAuth('captcha:solved');
          },
          onExpired: () => {
            if (cancelled) return;
            logPhoneAuth('captcha:expired');
            setError('Verification expired. Tap Send OTP again.');
            const v = verifierRef.current;
            disposeRecaptchaVerifier(v, container);
            verifierRef.current = null;
            releaseAuthRecaptchaSession(v);
            clearRecaptchaDom(container);
            setVerifierTick((t) => t + 1);
          },
        });
        if (!cancelled) {
          verifierRef.current = verifier;
          setAuthRecaptchaSession(verifier, container);
          logPhoneAuth('verifier:created (invisible)', { verifierTick });
        } else {
          disposeRecaptchaVerifier(verifier, container);
          releaseAuthRecaptchaSession(verifier);
          logPhoneAuth('verifier:create-aborted (strict/unmount race)');
        }
      } catch (err) {
        if (!cancelled) {
          logPhoneAuth('verifier:create-failed', { message: err?.message });
          setError(formatPhoneAuthError(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      const v = verifierRef.current;
      disposeRecaptchaVerifier(v, container);
      verifierRef.current = null;
      releaseAuthRecaptchaSession(v);
    };
  }, [step, verifierTick, containerId]);

  useEffect(() => {
    if (step !== 'code') {
      setResendSeconds(0);
      return undefined;
    }
    setResendSeconds(30);
    const id = setInterval(() => {
      setResendSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  function onDigitsChange(ev) {
    const next = String(ev.target.value ?? '')
      .replace(/\D/g, '')
      .slice(0, IN_MOBILE_LEN);
    setLocalDigits(next);
    if (error && error.includes('10 digit')) {
      setError('');
    }
  }

  function onOtpChange(ev) {
    const next = String(ev.target.value ?? '')
      .replace(/\D/g, '')
      .slice(0, OTP_LEN);
    setCode(next);
  }

  async function handleSendCode(e) {
    e.preventDefault();
    setError('');

    if (sendOtpLockRef.current || busy) {
      return;
    }

    const digits = localDigits.trim();
    if (digits.length !== IN_MOBILE_LEN) {
      setError('Enter valid 10 digit mobile number');
      return;
    }

    const container = getContainer();
    if (!container?.isConnected) {
      setError('Could not load verification. Try again.');
      return;
    }

    const verifier = verifierRef.current;
    if (!verifier) {
      setError('Could not load verification. Try again.');
      setVerifierTick((t) => t + 1);
      return;
    }

    sendOtpLockRef.current = true;
    setBusy(true);
    clearPhoneConfirmationResult();
    const e164 = toIndiaE164(digits);
    logPhoneAuth('otp:sending', { e164: `${e164.slice(0, 4)}…` });
    try {
      const confirmationResult = await signInWithPhoneNumber(auth, e164, verifier);

      setPhoneConfirmationResult(confirmationResult);
      logPhoneAuth('otp:sent');
      setError('');
      setStep('code');
    } catch (err) {
      logPhoneAuth('otp:send-failed', { code: err?.code });
      if (
        err?.code === 'auth/invalid-app-credential' ||
        err?.code === 'auth/network-request-failed'
      ) {
        console.warn(
          '[PhoneAuth] Check Network for net::ERR_BLOCKED_BY_CLIENT on googleapis / gstatic / recaptcha.',
        );
        logRecentAuthResourceUrls();
      }
      setError(formatPhoneAuthError(err));
      const vFail = verifierRef.current;
      disposeRecaptchaVerifier(vFail, container);
      verifierRef.current = null;
      releaseAuthRecaptchaSession(vFail);
      clearRecaptchaDom(container);
      clearPhoneConfirmationResult();
      setVerifierTick((t) => t + 1);
    } finally {
      sendOtpLockRef.current = false;
      setBusy(false);
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    setError('');
    if (busy) {
      return;
    }

    const digits = code.replace(/\D/g, '');
    if (digits.length !== OTP_LEN) {
      setError('Enter the 6 digit OTP.');
      return;
    }

    setBusy(true);
    try {
      const result = await verifyPhoneOtp(code);
      logPhoneAuth('otp:verify-success', { uid: result.user?.uid });
      const phone = result.user.phoneNumber?.trim() ?? '';
      const e164 = phone || toIndiaE164(localDigits);
      const sellerRow = phone ? await getSellerByPhone(phone) : await getSellerByPhone(e164);
      if (sellerRow?.isBlocked === true) {
        clearPhoneConfirmationResult();
        disposeVerifierSession(verifierRef, getContainer);
        await signOut(auth);
        window.location.assign('/login?blocked=1');
        return;
      }
      let linkedSellerId = null;
      if (sellerRow?.id) {
        linkedSellerId = sellerRow.id;
        persistSellerId(sellerRow.id);
      }
      await upsertIndiaPhoneAuthUser(result.user.uid, phone || toIndiaE164(localDigits), {
        sellerId: linkedSellerId,
      });
      clearPhoneConfirmationResult();
      logPhoneAuth('verifier:dispose (after successful verify)');
      disposeVerifierSession(verifierRef, getContainer);
      onSuccess?.(result.user);
    } catch (err) {
      logPhoneAuth('otp:verify-failed', { code: err?.code });
      setError(formatPhoneAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  function resetToPhoneStep(clearNumber) {
    logPhoneAuth('flow:reset-phone', { clearNumber });
    clearPhoneConfirmationResult();
    disposeVerifierSession(verifierRef, getContainer);
    setStep('phone');
    setCode('');
    setError('');
    if (clearNumber) {
      setLocalDigits('');
    }
    setVerifierTick((t) => t + 1);
  }

  function handleResend() {
    if (resendSeconds > 0 || busy) {
      return;
    }
    logPhoneAuth('flow:resend');
    resetToPhoneStep(false);
  }

  if (step === 'code') {
    return (
      <div className="stack">
        <p className="auth-lead muted" style={{ margin: 0 }}>
          Enter the code we sent to <strong>+91 {localDigits}</strong>.
        </p>
        <form className="auth-form stack" onSubmit={handleVerifyCode} noValidate>
          <div>
            <label className="label" htmlFor={`sms-code-${reactId}`}>
              Enter 6 digit OTP
            </label>
            <input
              id={`sms-code-${reactId}`}
              className="input auth-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={onOtpChange}
              maxLength={OTP_LEN}
            />
          </div>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="stack" style={{ gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify OTP'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || resendSeconds > 0}
              onClick={handleResend}
            >
              {resendSeconds > 0 ? `Resend OTP (${resendSeconds}s)` : 'Resend OTP'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => resetToPhoneStep(true)}
            >
              Use a different number
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="auth-lead muted" style={{ margin: 0 }}>
        India mobile — tap <strong>Send OTP</strong>. Verification uses an invisible reCAPTCHA
        when allowed by your network; you may occasionally see a quick check if Google flags the
        session.
      </p>

      <div className="fafo-recaptcha-mount" key={verifierTick}>
        <div
          id={containerId}
          ref={containerRef}
          className="fafo-recaptcha-container fafo-recaptcha-container--invisible"
          aria-hidden
        />
      </div>

      <form className="auth-form stack" onSubmit={handleSendCode} noValidate>
        <div>
          <label className="label" htmlFor={`phone-in-${reactId}`}>
            Mobile number
          </label>
          <div className="auth-phone-row">
            <span className="auth-phone-prefix" aria-hidden="true">
              +91
            </span>
            <input
              id={`phone-in-${reactId}`}
              className="input auth-input auth-phone-input"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="9876543210"
              value={localDigits}
              onChange={onDigitsChange}
              maxLength={IN_MOBILE_LEN}
              aria-describedby={error ? `phone-err-${reactId}` : undefined}
            />
          </div>
        </div>

        {error ? (
          <p className="error" id={`phone-err-${reactId}`} role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send OTP'}
        </button>
      </form>

      {phoneStepFooter ? <div className="auth-phone-step-footer stack">{phoneStepFooter}</div> : null}
    </div>
  );
}
