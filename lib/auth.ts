// Minimal family sign-in: an allow-listed email plus a shared password, kept in a signed cookie.
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

export function checkCredentials(email: string, password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return allowedEmails().includes(email.trim().toLowerCase()) && timingSafeEqual(password, expected);
}

// Cookie value: "<email>|<expiry ms>|<signature>"
export async function createSession(email: string): Promise<string> {
  const payload = `${email.trim().toLowerCase()}|${Date.now() + SESSION_DAYS * 86_400_000}`;
  return `${payload}|${await hmac(payload)}`;
}

export async function verifySession(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const i = value.lastIndexOf('|');
  if (i < 0) return null;
  const payload = value.slice(0, i);
  if (!timingSafeEqual(value.slice(i + 1), await hmac(payload))) return null;
  const [email, expiry] = payload.split('|');
  if (!email || Number(expiry) < Date.now() || !allowedEmails().includes(email)) return null;
  return email;
}
