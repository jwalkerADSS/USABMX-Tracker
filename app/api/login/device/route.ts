import { NextResponse, type NextRequest } from 'next/server';
import { ACCOUNT_PREFIX, SESSION_COOKIE, createSession, readDeviceKey, sessionCookie } from '@/lib/auth';
import { getAccount, touchAccount, trialEnds } from '@/lib/accounts';

// Signs back in with the device key "Stay signed in" left on the phone, when its sign-in cookie is gone.
// 200 { ok } with a new session; 401 { forget } when the key is no good any more (signed out elsewhere,
// account removed, trial over), so the phone drops it.
export async function POST(req: NextRequest) {
  const key = String((await req.formData()).get('key') ?? '');
  const forget = () => NextResponse.json({ forget: true }, { status: 401 });
  const who = key ? await readDeviceKey(key).catch(() => null) : null;
  if (!who) return forget();
  let trial: number | undefined;
  if (who.startsWith(ACCOUNT_PREFIX)) {
    const account = await getAccount(who.slice(ACCOUNT_PREFIX.length)).catch(() => undefined);
    if (account === undefined) return NextResponse.json({ error: 'unavailable' }, { status: 503 }); // database down: keep the key
    if (!account || account.mustChangePassword) return forget();
    trial = trialEnds(account) ?? undefined;
    if (trial != null && trial <= Date.now()) return forget();
    await touchAccount(account.username).catch(() => {});
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(who, trial), sessionCookie());
  return res;
}
