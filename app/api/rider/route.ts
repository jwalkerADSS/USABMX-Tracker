import { NextResponse, type NextRequest } from 'next/server';
import { RIDER_COOKIE } from '@/lib/session';

// Sets or clears the Test user's rider, then goes back to the landing page.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const profileId = Number(form.get('profileId'));
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  if (Number.isInteger(profileId) && profileId > 0) {
    res.cookies.set(RIDER_COOKIE, String(profileId), {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 365 * 86_400,
    });
  } else {
    res.cookies.delete(RIDER_COOKIE);
  }
  return res;
}
