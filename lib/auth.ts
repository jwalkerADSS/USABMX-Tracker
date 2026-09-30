// Sign-in, kept in a signed cookie. Most people have a username account (lib/accounts.ts), stored as "u:<username>".
// Two older ways still work: an allow-listed email plus the shared family password, and the guest user "Test".
// Uses Web Crypto so it runs in both middleware (edge) and route handlers.

export const SESSION_COOKIE = 'bmx_session';
export const SESSION_DAYS = 90;

const enc = new TextEncoder();

async function hmac(value: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error('SESSION_SECRET must be set to a long random string');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

// The Test user can sign in only while TEST_USER_PASSWORD is set; removing it signs them out everywhere.
export const TEST_USER = 'test';

export const ACCOUNT_PREFIX = 'u:';

function isAllowed(user: string): boolean {
  return (
    (user.startsWith(ACCOUNT_PREFIX) && user.length > ACCOUNT_PREFIX.length) ||
    allowedEmails().includes(user) ||
    (user === TEST_USER && !!process.env.TEST_USER_PASSWORD)
  );
}

// The family email and Test sign-ins; accounts are checked in lib/accounts.ts.
export function checkCredentials(email: string, password: string): boolean {
  const user = email.trim().toLowerCase();
  const expected = user === TEST_USER ? process.env.TEST_USER_PASSWORD : process.env.APP_PASSWORD;
  if (!expected) return false;
  return isAllowed(user) && timingSafeEqual(password, expected);
}

// Cookie value: "<who>|<expiry ms>|<signature>", or "<who>|<expiry ms>|trial|<signature>" for a trial account,
// whose session ends when the trial does.
export async function createSession(who: string, trialEnds?: number): Promise<string> {
  const expiry = Math.min(Date.now() + SESSION_DAYS * 86_400_000, trialEnds ?? Infinity);
  const payload = `${who.trim().toLowerCase()}|${expiry}${trialEnds ? '|trial' : ''}`;
  return `${payload}|${await hmac(payload)}`;
}

async function readSession(value: string | undefined): Promise<{ who: string; expired: boolean; trial: boolean } | null> {
  if (!value) return null;
  const i = value.lastIndexOf('|');
  if (i < 0) return null;
  const payload = value.slice(0, i);
  if (!timingSafeEqual(value.slice(i + 1), await hmac(payload))) return null;
  const [who, expiry, kind] = payload.split('|');
  if (!who || !isAllowed(who)) return null;
  return { who, expired: !(Number(expiry) >= Date.now()), trial: kind === 'trial' };
}

export async function verifySession(value: string | undefined): Promise<string | null> {
  const s = await readSession(value);
  return s && !s.expired ? s.who : null;
}

// True when the cookie belongs to a trial that has run out, so sign-in can say why.
export async function trialEnded(value: string | undefined): Promise<boolean> {
  const s = await readSession(value);
  return !!s?.expired && s.trial;
}
