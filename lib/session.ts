import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, TEST_USER, verifySession } from './auth';

// The rider the Test user chose, kept on their device.
export const RIDER_COOKIE = 'bmx_rider';

export async function currentUser(): Promise<string | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value).catch(() => null);
}

export async function isTestUser(): Promise<boolean> {
  return (await currentUser()) === TEST_USER;
}

export async function chosenRider(): Promise<number | null> {
  const id = Number((await cookies()).get(RIDER_COOKIE)?.value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
