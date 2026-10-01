'use client';

import { forgetDevice } from './device-sign-in';

// Sign out also forgets this phone's "Stay signed in" key, so the app doesn't sign straight back in.
export function SignOutButton() {
  return <button type="submit" className="link" onClick={forgetDevice}>Sign out</button>;
}
