import 'server-only';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { del, get, hit, set } from './store';
import { TEST_USER } from './auth';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const MAX_RIDERS = 5;

export type Account = {
  username: string; // lowercase, used as the key
  displayName: string; // as typed at sign-up
  email: string;
  passwordHash: string;
  riders: number[]; // USA BMX profile ids, up to MAX_RIDERS
  createdAt: string;
};

const RESERVED = new Set([TEST_USER, 'admin', 'administrator', 'root', 'support', 'usabmx']);
const userKey = (u: string) => `user:${u.toLowerCase()}`;
const emailKey = (e: string) => `email:${e.toLowerCase()}`;

export function checkUsername(u: string): string | null {
  if (!/^[a-zA-Z0-9_.-]{3,20}$/.test(u)) return 'Usernames are 3 to 20 letters, numbers, dots, dashes or underscores.';
  if (RESERVED.has(u.toLowerCase())) return 'That username is taken.';
  return null;
}

export function checkPassword(p: string): string | null {
  return p.length >= 8 && p.length <= 200 ? null : 'Passwords need at least 8 characters.';
}

export function checkEmail(e: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200 ? null : 'That email address doesn’t look right.';
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export async function getAccount(username: string): Promise<Account | null> {
  const raw = await get(userKey(username));
  return raw ? (JSON.parse(raw) as Account) : null;
}

async function save(account: Account): Promise<void> {
  await set(userKey(account.username), JSON.stringify(account));
}

export async function createAccount(input: { username: string; password: string; email: string }): Promise<Account | string> {
  const displayName = input.username.trim();
  const email = input.email.trim().toLowerCase();
  const problem = checkUsername(displayName) ?? checkPassword(input.password) ?? checkEmail(email);
  if (problem) return problem;
  const account: Account = {
    username: displayName.toLowerCase(), displayName, email, passwordHash: await hashPassword(input.password), riders: [],
    createdAt: new Date().toISOString(),
  };
  // Claim the username, then the email; undo the first if the second is already in use.
  if (!(await set(userKey(account.username), JSON.stringify(account), { onlyIfNew: true }))) return 'That username is taken.';
  if (!(await set(emailKey(email), account.username, { onlyIfNew: true }))) {
    await del(userKey(account.username));
    return 'That email address already has an account. Use “Forgot password” to get back in.';
  }
  return account;
}

// Ten wrong passwords lock that username for 15 minutes.
export async function signInAccount(username: string, password: string): Promise<Account | 'locked' | null> {
  const u = username.trim().toLowerCase();
  const failKey = `fail:${u}`;
  if (Number(await get(failKey)) >= 10) return 'locked';
  const account = await getAccount(u);
  if (account && (await passwordMatches(password, account.passwordHash))) {
    await del(failKey);
    return account;
  }
  await hit(failKey, 15 * 60);
  return null;
}

export async function setRiders(username: string, riders: number[]): Promise<Account | null> {
  const account = await getAccount(username);
  if (!account) return null;
  account.riders = [...new Set(riders)].slice(0, MAX_RIDERS);
  await save(account);
  return account;
}

// ---- Password reset --------------------------------------------------------------

export async function findAccount(usernameOrEmail: string): Promise<Account | null> {
  const s = usernameOrEmail.trim().toLowerCase();
  const username = s.includes('@') ? await get(emailKey(s)) : s;
  return username ? getAccount(username) : null;
}

// A one-time link that works for an hour.
export async function createResetToken(username: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await set(`reset:${token}`, username, { seconds: 60 * 60 });
  return token;
}

export async function resetTokenUser(token: string): Promise<string | null> {
  return /^[A-Za-z0-9_-]{20,100}$/.test(token) ? get(`reset:${token}`) : null;
}

export async function resetPassword(token: string, password: string): Promise<Account | string> {
  const problem = checkPassword(password);
  if (problem) return problem;
  const username = await resetTokenUser(token);
  const account = username ? await getAccount(username) : null;
  if (!account) return 'That reset link has expired. Ask for a new one.';
  await del(`reset:${token}`);
  account.passwordHash = await hashPassword(password);
  await save(account);
  await del(`fail:${account.username}`);
  return account;
}

// Sends through Resend (resend.com) when RESEND_API_KEY is set in Vercel.
export function emailReady(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendResetEmail(account: Account, link: string): Promise<void> {
  // Local development: RESEND_API_KEY=console prints the link instead of sending it.
  if (process.env.RESEND_API_KEY === 'console' && !process.env.VERCEL) {
    console.log(`Password reset link for ${account.username}: ${link}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'BMX Tracker <onboarding@resend.dev>',
      to: [account.email],
      subject: 'Reset your BMX Tracker password',
      text: `Hi ${account.displayName},\n\nUse this link to choose a new password. It works once, for the next hour:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    }),
  });
  if (!res.ok) throw new Error(`Email failed with ${res.status}`);
}
