import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { NomadLogo } from '../components/NomadLogo';
import { resolvePostLoginPath } from '../services/postLoginRedirect';

export function Home() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const path = await resolvePostLoginPath(user);
        if (!cancelled) navigate(path, { replace: true });
      } catch {
        if (!cancelled) navigate('/dashboard', { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, navigate]);

  function handleExploreDemo() {
    sessionStorage.setItem('fafo_demo', '1');
    navigate('/dashboard', { replace: true });
  }

  function handleFreeTrial() {
    navigate('/login', { state: { intent: 'trial' } });
  }

  function handleGoLive() {
    navigate('/login', { state: { intent: 'live' } });
  }

  if (loading) {
    return (
      <div className="landing">
        <div className="landing-inner">
          <p className="landing-muted" style={{ margin: 0 }}>
            Loading…
          </p>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="landing">
        <div className="landing-inner">
          <p className="landing-muted" style={{ margin: 0 }}>
            Opening your workspace…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="landing">
      <div className="landing-inner">
        <header className="landing-brand-block">
          <div className="landing-logo-wrap">
            <NomadLogo size={108} />
          </div>
          <p className="landing-eyebrow">Apps for Daily life</p>
          <h1 className="landing-title">FaFo App</h1>
          <p className="landing-tagline">
            App for Street Food Vendors &amp; Small Kiosks
          </p>
        </header>

        <section className="landing-cta-row" aria-label="Get started">
          <div className="landing-card landing-card--neutral">
            <p className="landing-card-text">
              Explore features with Mock Data
            </p>
            <button
              type="button"
              className="landing-btn landing-btn--cyan"
              onClick={handleExploreDemo}
            >
              Explore (demo mode)
            </button>
          </div>

          <div className="landing-connector" aria-hidden>
            <span className="landing-connector-line" />
            <span className="landing-connector-dot" />
            <span className="landing-connector-line" />
          </div>

          <div className="landing-card landing-card--gold">
            <p className="landing-card-text">Try out Features for Free</p>
            <button
              type="button"
              className="landing-btn landing-btn--gold"
              onClick={handleFreeTrial}
            >
              Free Trial (15 days)
            </button>
          </div>
        </section>

        <section className="landing-go-live" aria-label="Go live">
          <div className="landing-go-live-inner">
            <p className="landing-go-live-copy">
              <span className="landing-go-live-head">Start Today</span>
              <span className="landing-go-live-sub">Boost Sales</span>
            </p>
            <button
              type="button"
              className="landing-btn landing-btn--green landing-btn--compact"
              onClick={handleGoLive}
            >
              Go Live
            </button>
          </div>
        </section>

        <section
          className="landing-ad"
          aria-label="Advertisements and promotions"
        >
          <div className="landing-ad-inner">
            <p className="landing-ad-title">Advertisements &amp; Promos Banner</p>
            <p className="landing-ad-placeholder">Placeholder Image</p>
          </div>
        </section>
      </div>
    </div>
  );
}
