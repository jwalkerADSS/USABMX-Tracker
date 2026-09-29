import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, SESSION_DAYS, checkCredentials, createSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '/');
  // Only same-site paths. Browsers read a backslash as a slash, so "/\evil.com" would leave the site.
  const safeNext = next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/';

  if (!checkCredentials(email, password)) {
    const back = new URL('/login', req.url);
    back.searchParams.set('error', '1');
    if (safeNext !== '/') back.searchParams.set('next', safeNext);
    return NextResponse.redirect(back, 303);
  }
  const res = NextResponse.redirect(new URL(safeNext, req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSession(email), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86_400,
  });
  return res;
}
