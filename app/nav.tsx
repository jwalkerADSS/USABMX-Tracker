import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentAccount } from '@/lib/session';
import { isAdmin } from '@/lib/accounts';
import { TourHelp } from './tour';

// title: shown under the top bar and pinned with it while the page scrolls (the rider page's name).
export async function Nav({ back, title }: { back?: boolean; title?: ReactNode }) {
  const account = await currentAccount();
  return (
    <header className={title ? 'nav with-title' : 'nav'}>
      {back ? <Link href="/">‹ Riders</Link> : <span className="brand">BMX Tracker <TourHelp /></span>}
      <nav>
        {isAdmin(account) ? <Link href="/admin">Admin</Link> : null}
        {account ? <Link href="/my-riders">My riders</Link> : null}
        <Link href="/search">Search</Link>
        <form method="post" action="/api/logout">
          <button type="submit" className="link">Sign out</button>
        </form>
      </nav>
      {title ? <div className="nav-title">{title}</div> : null}
    </header>
  );
}
