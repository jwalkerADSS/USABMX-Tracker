import 'server-only';
import { cookies } from 'next/headers';
import { ACCOUNT_PREFIX, SESSION_COOKIE, SESSION_DAYS, TEST_USER, createSession, verifySession } from './auth';
import { getAccount, type Account } from './accounts';

// The rider the Test user chose, kept on their device.
export const RIDER_COOKIE = 'bmx_rider';

export async function currentUser(): Promise<string | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value).catch(() => null);
}

export async function isTestUser(): Promise<boolean> {
  return (await currentUser()) === TEST_USER;
}

// The signed-in username account, or null for the family email and Test sign-ins.
export async function currentAccount(): Promise<Account | null> {
  const user = await currentUser();
  return user?.startsWith(ACCOUNT_PREFIX) ? getAccount(user.slice(ACCOUNT_PREFIX.length)).catch(() => null) : null;
}

export async function startSession(who: string, trialEnds?: number): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await createSession(who, trialEnds), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86_400,
  });
}

export async function chosenRider(): Promise<number | null> {
  const id = Number((await cookies()).get(RIDER_COOKIE)?.value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
