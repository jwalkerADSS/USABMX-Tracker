import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// The version of the deployment that answers, for the "new version" banner (app/update-banner.tsx).
export function GET() {
  return NextResponse.json({ version: process.env.APP_VERSION }, { headers: { 'cache-control': 'no-store' } });
}
