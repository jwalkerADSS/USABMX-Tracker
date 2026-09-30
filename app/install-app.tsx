'use client';

import { useEffect, useState } from 'react';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type Mode = 'hidden' | 'prompt' | 'ios' | 'android';

declare global {
  interface Window { __installPrompt?: InstallPrompt }
}

function installed(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

// "Install app" at the foot of each page in the browser, hidden inside the installed app. Chrome on Android
// installs in one tap; iPhone has no install prompt, so it shows the Add to Home Screen steps.
export function InstallApp() {
  const [mode, setMode] = useState<Mode>('hidden');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (installed()) return;
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
    const fallback: Mode = ios ? 'ios' : /Android/.test(ua) ? 'android' : 'hidden';
    setMode(window.__installPrompt ? 'prompt' : fallback);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__installPrompt = e as InstallPrompt;
      setMode('prompt');
    };
    const onInstalled = () => setMode('hidden');
    addEventListener('beforeinstallprompt', onPrompt);
    addEventListener('appinstalled', onInstalled);
    return () => {
      removeEventListener('beforeinstallprompt', onPrompt);
      removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (mode === 'hidden') return null;

  const install = async () => {
    const prompt = window.__installPrompt;
    if (mode !== 'prompt' || !prompt) return setOpen(o => !o);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    window.__installPrompt = undefined;
    // A prompt can only be used once; if they said no, fall back to the manual steps.
    setMode(outcome === 'accepted' ? 'hidden' : 'android');
  };

  return (
    <footer className="install-app">
      <button type="button" className="secondary" onClick={install} aria-expanded={mode === 'prompt' ? undefined : open}>
        Install app on this phone
      </button>
      {open && mode === 'ios' ? (
        <ol className="small">
          <li>Tap the <strong>Share</strong> button (the square with an arrow pointing up) in the browser bar.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          <li>Open BMX Tracker from its new icon. It runs full screen, and you sign in once inside it.</li>
        </ol>
      ) : null}
      {open && mode === 'android' ? (
        <ol className="small">
          <li>Tap the browser&apos;s menu (<strong>⋮</strong>) at the top right.</li>
          <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>, then <strong>Install</strong>.</li>
          <li>Open BMX Tracker from its new icon. It runs full screen.</li>
        </ol>
      ) : null}
    </footer>
  );
}
