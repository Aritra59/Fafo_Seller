import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AuthModal } from '../components/auth/AuthModal';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { PhoneSignIn } from '../components/PhoneSignIn';
import { ShopCodeAuth } from '../components/auth/ShopCodeAuth';
import { clearDemoExplorer } from '../constants/demoMode';
import { resolvePostLoginPath } from '../services/postLoginRedirect';
import { PublicHomeAdSection } from '../components/ads/PublicHomeAdSection';

const TITLE_ID = 'auth-modal-title';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const intent = location.state?.intent;
  const [tab, setTab] = useState('phone'); // phone | google | shop

  function handleBackToHub() {
    navigate('/', { replace: true });
  }

  useEffect(() => {
    if (loading || !user) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const path = await resolvePostLoginPath(user);
        if (!cancelled) {
          clearDemoExplorer();
          navigate(path, { replace: true });
        }
      } catch {
        if (!cancelled) {
          navigate('/onboarding', { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-loading muted">Loading…</div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="auth-page">
        <AuthModal onClose={handleBackToHub}>
          <div className="auth-modal-head">
            <h1 className="auth-modal-title" id={TITLE_ID}>
              Signing you in
            </h1>
            <button
              type="button"
              className="auth-btn-close"
              onClick={handleBackToHub}
              aria-label="Back to home"
            >
              Back
            </button>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Checking your shop profile…
          </p>
        </AuthModal>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <AuthModal onClose={handleBackToHub}>
        <div className="auth-modal-head">
          <h1 className="auth-modal-title" id={TITLE_ID}>
            Sign in
          </h1>
          <button
            type="button"
            className="auth-btn-close"
            onClick={handleBackToHub}
            aria-label="Back to home"
          >
            Back
          </button>
        </div>

        {intent === 'trial' && (
          <p className="auth-banner muted" style={{ margin: '0 0 1rem' }}>
            Free trial — sign in to get started.
          </p>
        )}
        {intent === 'live' && (
          <p className="auth-banner muted" style={{ margin: '0 0 1rem' }}>
            Go live — use phone OTP or your shop code.
          </p>
        )}
        {searchParams.get('blocked') === '1' ? (
          <p className="error" style={{ margin: '0 0 1rem' }} role="alert">
            This shop cannot sign in (blocked). Contact support if you think this is a mistake.
          </p>
        ) : null}
        {searchParams.get('need') === 'shop' ? (
          <p className="auth-banner muted" style={{ margin: '0 0 1rem' }} role="status">
            Sign in with your <strong>shop code</strong> on the tab below, or use phone if your
            number is on file.
          </p>
        ) : null}

        <div className="auth-tabs" role="tablist" aria-label="Sign-in method">
          <div className="auth-tab-row auth-tab-row--3">
            <button
              type="button"
              role="tab"
              id="tab-phone"
              aria-selected={tab === 'phone'}
              className={`auth-tab${tab === 'phone' ? ' auth-tab--active' : ''}`}
              onClick={() => setTab('phone')}
            >
              Phone OTP
            </button>
            <button
              type="button"
              role="tab"
              id="tab-google"
              aria-selected={tab === 'google'}
              className={`auth-tab${tab === 'google' ? ' auth-tab--active' : ''}`}
              onClick={() => setTab('google')}
            >
              Google
            </button>
            <button
              type="button"
              role="tab"
              id="tab-shop"
              aria-selected={tab === 'shop'}
              className={`auth-tab${tab === 'shop' ? ' auth-tab--active' : ''}`}
              onClick={() => setTab('shop')}
            >
              Shop code
            </button>
          </div>

          <div
            role="tabpanel"
            id="panel-phone"
            aria-labelledby="tab-phone"
            hidden={tab !== 'phone'}
            className="auth-tab-panel"
          >
            {tab === 'phone' && <PhoneSignIn />}
          </div>

          <div
            role="tabpanel"
            id="panel-google"
            aria-labelledby="tab-google"
            hidden={tab !== 'google'}
            className="auth-tab-panel"
          >
            {tab === 'google' && (
              <div className="stack" style={{ gap: '0.75rem' }}>
                <p className="auth-lead muted" style={{ margin: 0 }}>
                  Sign in with your Google account linked to your shop.
                </p>
                <GoogleSignInButton />
              </div>
            )}
          </div>

          <div
            role="tabpanel"
            id="panel-shop"
            aria-labelledby="tab-shop"
            hidden={tab !== 'shop'}
            className="auth-tab-panel"
          >
            {tab === 'shop' && <ShopCodeAuth />}
          </div>
        </div>

        <div className="auth-landing-ad" style={{ marginTop: '1rem' }}>
          <PublicHomeAdSection />
        </div>
      </AuthModal>
    </div>
  );
}
