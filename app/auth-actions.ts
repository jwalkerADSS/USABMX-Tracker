'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { timingSafeEqual } from 'node:crypto';
import {
  MAX_RIDERS, createAccount, createResetToken, emailReady, findAccount, resetPassword, sendResetEmail, setRiders,
} from '@/lib/accounts';
import { ACCOUNT_PREFIX } from '@/lib/auth';
import { currentAccount, startSession } from '@/lib/session';
import { hit, storeReady } from '@/lib/store';
import { findTracked } from '@/lib/riders';
import { getProfile } from '@/lib/usabmx';

export type FormState = { error?: string; done?: boolean; username?: string; email?: string };

function sameCode(given: string, expected: string): boolean {
  const a = Buffer.from(given.trim());
  const b = Buffer.from(expected.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

async function clientIp(): Promise<string> {
  return (await headers()).get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const username = String(form.get('username') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const keep = { username, email };
  const code = process.env.SIGNUP_CODE;
  if (!code || !storeReady()) return { ...keep, error: 'Sign-up isn’t open on this site yet.' };
  if ((await hit(`signup:${await clientIp()}`, 60 * 60)) > 10) return { ...keep, error: 'Too many tries. Wait an hour and try again.' };
  if (!sameCode(String(form.get('code') ?? ''), code)) return { ...keep, error: 'That invite code isn’t right.' };
  if (password !== String(form.get('confirm') ?? '')) return { ...keep, error: 'The two passwords don’t match.' };
  const account = await createAccount({ username, password, email });
  if (typeof account === 'string') return { ...keep, error: account };
  await startSession(ACCOUNT_PREFIX + account.username);
  redirect('/my-riders?welcome=1');
}

// The link in the email points at the live site, never at whatever host the request claimed.
async function siteUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}

export async function requestReset(_: FormState, form: FormData): Promise<FormState> {
  const who = String(form.get('who') ?? '').trim();
  if (!storeReady() || !emailReady()) {
    return { error: 'Password reset emails aren’t set up on this site yet. Ask the person who runs it to help.' };
  }
  if (!who) return { error: 'Enter your username or email.' };
  // Same answer whether or not the account exists, so this can't be used to find accounts.
  if ((await hit(`resetreq:${who.toLowerCase()}`, 60 * 60)) <= 5) {
    const account = await findAccount(who).catch(() => null);
    if (account) {
      const token = await createResetToken(account.username);
      await sendResetEmail(account, `${await siteUrl()}/reset?token=${token}`).catch(e => console.error('Reset email failed', e.message));
    }
  }
  return { done: true };
}

export async function chooseNewPassword(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get('password') ?? '');
  if (password !== String(form.get('confirm') ?? '')) return { error: 'The two passwords don’t match.' };
  const account = await resetPassword(String(form.get('token') ?? ''), password);
  if (typeof account === 'string') return { error: account };
  await startSession(ACCOUNT_PREFIX + account.username);
  redirect('/');
}

export async function addRider(form: FormData): Promise<void> {
  const account = await currentAccount();
  const raw = Number(form.get('profileId'));
  if (!account || !Number.isInteger(raw) || raw <= 0) redirect('/');
  // Some riders have an older duplicate profile that USA BMX won't show; use their main one.
  const id = findTracked(raw)?.profileId ?? raw;
  const exists = await getProfile(id).catch(() => null);
  if (exists && account.riders.length < MAX_RIDERS) await setRiders(account.username, [...account.riders, id]);
  redirect('/my-riders');
}

export async function removeRider(form: FormData): Promise<void> {
  const account = await currentAccount();
  const id = Number(form.get('profileId'));
  if (!account) redirect('/');
  await setRiders(account.username, account.riders.filter(r => r !== id));
  redirect('/my-riders');
}
