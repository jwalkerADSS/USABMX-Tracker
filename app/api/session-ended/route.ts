import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

// Where a sign-in for a removed account is sent: clears it and explains on the sign-in page.
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login?error=removed', req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
