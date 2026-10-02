import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, trialEnded, verifySession } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const email = await verifySession(cookie).catch(() => null);
  if (email) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = (await trialEnded(cookie).catch(() => false))
    ? '?error=trial'
    : req.nextUrl.pathname === '/' ? '' : `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except sign-in, sign-up, forgot password, the version check, and the files a phone needs to install the app.
  matcher: ['/((?!login|signup|forgot|api/login|api/version|_next/|manifest.webmanifest|icons/|favicon.ico|apple-touch-icon.png|logo.webp|logo-small.webp).*)'],
};
