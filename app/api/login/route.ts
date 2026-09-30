import { NextResponse, type NextRequest } from 'next/server';
import { ACCOUNT_PREFIX, SESSION_COOKIE, SESSION_DAYS, TEST_USER, checkCredentials, createSession } from '@/lib/auth';
import { signInAccount, touchAccount, trialEnds, wasRemoved } from '@/lib/accounts';
import { storeReady } from '@/lib/store';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const username = String(form.get('username') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '/');
  // Only same-site paths. Browsers read a backslash as a slash, so "/\evil.com" would leave the site.
  const safeNext = next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/';

  const fail = (error: string) => {
    const back = new URL('/login', req.url);
    back.searchParams.set('error', error);
    if (safeNext !== '/') back.searchParams.set('next', safeNext);
    return NextResponse.redirect(back, 303);
  };

  let who: string;
  let trial: number | undefined;
  if (username.includes('@') || username.toLowerCase() === TEST_USER) {
    // The family email and the Test user, from before accounts.
    if (!checkCredentials(username, password)) return fail('1');
    who = username.toLowerCase();
  } else {
    if (!storeReady()) return fail('setup');
    const account = await signInAccount(username, password).catch(() => undefined);
    if (account === undefined) return fail('setup');
    if (account === 'locked') return fail('locked');
    if (!account) return fail((await wasRemoved(username).catch(() => false)) ? 'removed' : '1');
    trial = trialEnds(account) ?? undefined;
    if (trial != null && trial <= Date.now()) return fail('trial');
    who = ACCOUNT_PREFIX + account.username;
    await touchAccount(account.username).catch(() => {});
    // After an admin reset, the temporary password has to be replaced first.
    if (account.mustChangePassword) return signedIn(req, who, '/change-password', trial);
  }
  return signedIn(req, who, safeNext, trial);
}

async function signedIn(req: NextRequest, who: string, to: string, trial?: number) {
  const res = NextResponse.redirect(new URL(to, req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSession(who, trial), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86_400,
  });
  return res;
}
