/**
 * Optional diagnostics: log auth-related fetch URLs on failure (e.g. ERR_BLOCKED_BY_CLIENT).
 * Patches `fetch` once per page load.
 */
let fetchPatched = false;

function isAuthRelatedUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  return (
    /identitytoolkit\.googleapis\.com/i.test(url) ||
    /securetoken\.googleapis\.com/i.test(url) ||
    /recaptcha/i.test(url) ||
    /google\.com\/recaptcha/i.test(url) ||
    /www\.google\.com\/.*recaptcha/i.test(url) ||
    /firebaseapp\.com/i.test(url) ||
    /firebase\.googleapis\.com/i.test(url)
  );
}

export function installAuthFetchDebugLogger() {
  if (fetchPatched || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }
  fetchPatched = true;
  const orig = window.fetch.bind(window);

  window.fetch = async function authFetchDebugWrapper(input, init) {
    let url = '';
    try {
      if (typeof input === 'string') {
        url = input;
      } else if (input && typeof input === 'object' && 'url' in input) {
        url = String(input.url);
      }
    } catch {
      url = '';
    }

    try {
      const res = await orig(input, init);
      if (!res.ok && isAuthRelatedUrl(url)) {
        console.warn('[PhoneAuth] Auth-related fetch non-OK', {
          url,
          status: res.status,
          statusText: res.statusText,
        });
      }
      return res;
    } catch (err) {
      if (url) {
        console.warn('[PhoneAuth] Fetch threw (extension / client blocker / offline?)', {
          url,
          name: err?.name,
          message: err?.message,
        });
      }
      throw err;
    }
  };
}

export function logRecentAuthResourceUrls(max = 25) {
  if (typeof performance === 'undefined' || !performance.getEntriesByType) {
    return;
  }
  try {
    const entries = performance.getEntriesByType('resource');
    const tail = entries.slice(-max);
    const interesting = tail.filter((e) => isAuthRelatedUrl(e.name));
    if (interesting.length === 0) {
      console.warn('[PhoneAuth] No recent auth-related PerformanceResourceTiming entries.', {
        hint: 'Open Network tab and look for blocked (red) requests to googleapis / gstatic / recaptcha.',
      });
      return;
    }
    for (const e of interesting) {
      const failed =
        e.transferSize === 0 &&
        e.decodedBodySize === 0 &&
        e.duration > 0 &&
        (e.responseStatus === 0 || e.responseStatus === undefined);
      console.warn('[PhoneAuth] Resource timing', {
        url: e.name,
        initiatorType: e.initiatorType,
        durationMs: Math.round(e.duration),
        responseStatus: e.responseStatus,
        possiblyBlocked: failed,
      });
    }
  } catch (e) {
    console.warn('[PhoneAuth] logRecentAuthResourceUrls failed', e);
  }
}
