'use client';

import { useEffect } from 'react';
import { DEVICE_HANDOFF_COOKIE } from '@/lib/auth';

const KEY = 'bmx-device-key';

function store(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

// Clears the phone's device key; used by Sign out.
export function forgetDevice() {
  store()?.removeItem(KEY);
}

// The backup for "Stay signed in": keeps the device key from sign-in in the app's storage on the phone, and when
// the app lands on the sign-in page because the phone dropped the sign-in cookie, uses it to sign straight back in.
export function DeviceSignIn() {
  useEffect(() => {
    const s = store();
    const handoff = document.cookie.split('; ').find(c => c.startsWith(`${DEVICE_HANDOFF_COOKIE}=`));
    if (handoff) {
      const value = decodeURIComponent(handoff.slice(DEVICE_HANDOFF_COOKIE.length + 1));
      if (value === 'forget') s?.removeItem(KEY);
      else s?.setItem(KEY, value);
      document.cookie = `${DEVICE_HANDOFF_COOKIE}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
    }
    if (location.pathname !== '/login') return;
    const params = new URLSearchParams(location.search);
    const error = params.get('error');
    // Never sign back in over a "deleted" or "trial ended" message, or straight after a wrong password.
    if (error === 'removed' || error === 'trial') s?.removeItem(KEY);
    const key = s?.getItem(KEY);
    if (!key || error) return;
    const next = params.get('next') ?? '/';
    const safeNext = next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/';
    const body = new FormData();
    body.set('key', key);
    fetch('/api/login/device', { method: 'POST', body })
      .then(res => {
        if (res.ok) location.replace(safeNext);
        else if (res.status === 401) s?.removeItem(KEY);
      })
      .catch(() => {});
  }, []);
  return null;
}
