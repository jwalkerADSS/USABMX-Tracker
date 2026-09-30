'use client';

import { useEffect, useState } from 'react';

const CHECK_EVERY = 10 * 60 * 1000;

// When a new version is deployed while the app is open (often in the background on a phone), a banner offers
// to reload. Checks when the app comes back to the screen and every 10 minutes while it's showing.
export function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const mine = process.env.APP_VERSION;
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 30_000) return;
      last = Date.now();
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const { version } = (await res.json()) as { version?: string };
        if (version && mine && version !== mine) setStale(true);
      } catch {}
    };
    const timer = setInterval(check, CHECK_EVERY);
    document.addEventListener('visibilitychange', check);
    addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      removeEventListener('focus', check);
    };
  }, []);

  if (!stale) return null;
  return (
    <button type="button" className="update-banner" onClick={() => location.reload()}>
      A new version of BMX Tracker is ready. <strong>Tap to update</strong>
    </button>
  );
}
