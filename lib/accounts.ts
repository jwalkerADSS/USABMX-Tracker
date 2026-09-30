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
  mustChangePassword?: boolean; // set by an admin reset
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
// There's no email service. Someone who forgets their password asks for a reset, which emails the admin
// from their own mail app and is listed on the admin page. The admin sets a temporary password there and
// emails it back; the rider's family then picks a new password at their next sign-in.

export async function findAccount(usernameOrEmail: string): Promise<Account | null> {
  const s = usernameOrEmail.trim().toLowerCase();
  const username = s.includes('@') ? await get(emailKey(s)) : s;
  return username ? getAccount(username) : null;
}

export function isAdmin(account: Account | null): boolean {
  const admins = (process.env.ADMIN_USERNAMES ?? '').split(',').map(u => u.trim().toLowerCase()).filter(Boolean);
  return !!account && admins.includes(account.username);
}

export type ResetRequest = { username: string; at: string };
const REQUESTS = 'reset-requests';

export async function resetRequests(): Promise<ResetRequest[]> {
  return JSON.parse((await get(REQUESTS)) ?? '[]') as ResetRequest[];
}

// Recorded only for real accounts, and once per account, so the list stays short.
export async function requestReset(usernameOrEmail: string): Promise<void> {
  const account = await findAccount(usernameOrEmail);
  if (!account) return;
  const list = (await resetRequests()).filter(r => r.username !== account.username);
  await set(REQUESTS, JSON.stringify([...list, { username: account.username, at: new Date().toISOString() }].slice(-50)));
}

// Admin only: a new random password the admin emails to the account holder, who must replace it on sign-in.
export async function setTemporaryPassword(username: string): Promise<{ account: Account; password: string } | null> {
  const account = await getAccount(username);
  if (!account) return null;
  const password = randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 10);
  account.passwordHash = await hashPassword(password);
  account.mustChangePassword = true;
  await save(account);
  await del(`fail:${account.username}`);
  await set(REQUESTS, JSON.stringify((await resetRequests()).filter(r => r.username !== account.username)));
  return { account, password };
}

export async function changePassword(username: string, current: string, next: string): Promise<Account | string> {
  const problem = checkPassword(next);
  if (problem) return problem;
  const account = await getAccount(username);
  if (!account || !(await passwordMatches(current, account.passwordHash))) return 'Your current password isn’t right.';
  if (current === next) return 'Pick a password different from the current one.';
  account.passwordHash = await hashPassword(next);
  delete account.mustChangePassword;
  await save(account);
  return account;
}
