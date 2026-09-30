'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { timingSafeEqual } from 'node:crypto';
import {
  MAX_RIDERS, changePassword, createAccount, isAdmin, requestReset as recordResetRequest, setRiders, setTemporaryPassword,
} from '@/lib/accounts';
import { ACCOUNT_PREFIX } from '@/lib/auth';
import { currentAccount, startSession } from '@/lib/session';
import { hit, storeReady } from '@/lib/store';
import { findTracked } from '@/lib/riders';
import { getProfile } from '@/lib/usabmx';

export type FormState = { error?: string; done?: boolean; username?: string; email?: string; mailto?: string; password?: string };

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

// "Forgot password": lists the request on the admin page, then hands back an email to the admin for the person to
// send from their own mail app, since the site has no email service.
export async function requestReset(_: FormState, form: FormData): Promise<FormState> {
  const username = String(form.get('username') ?? '').trim();
  if (!storeReady()) return { error: 'Accounts aren’t set up on this site yet.' };
  if (!username) return { error: 'Enter your username.' };
  if ((await hit(`resetreq:${await clientIp()}`, 60 * 60)) <= 10) await recordResetRequest(username).catch(() => {});
  const admin = process.env.ADMIN_EMAIL;
  const mailto = admin
    ? `mailto:${admin}?subject=${encodeURIComponent('BMX Tracker password reset')}&body=${encodeURIComponent(
        `Hi, please reset the BMX Tracker password for username ${username}. Thanks!`)}`
    : undefined;
  return { done: true, username, mailto };
}

export async function changeMyPassword(_: FormState, form: FormData): Promise<FormState> {
  const account = await currentAccount();
  if (!account) redirect('/login');
  const next = String(form.get('password') ?? '');
  if (next !== String(form.get('confirm') ?? '')) return { error: 'The two new passwords don’t match.' };
  const result = await changePassword(account.username, String(form.get('current') ?? ''), next);
  if (typeof result === 'string') return { error: result };
  redirect('/');
}

// Admin page: set a temporary password and get an email ready to send it to the account holder.
export async function adminReset(_: FormState, form: FormData): Promise<FormState> {
  if (!isAdmin(await currentAccount())) return { error: 'Only the admin can do that.' };
  const result = await setTemporaryPassword(String(form.get('username') ?? '').trim().toLowerCase());
  if (!result) return { error: 'No account with that username.' };
  const { account, password } = result;
  const body = `Hi ${account.displayName},\n\nYour BMX Tracker password was reset. Sign in with username ${account.displayName} and this temporary password:\n\n${password}\n\nYou'll be asked to choose a new password right after.`;
  return {
    done: true, username: account.displayName, email: account.email, password,
    mailto: `mailto:${account.email}?subject=${encodeURIComponent('Your BMX Tracker password')}&body=${encodeURIComponent(body)}`,
  };
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
