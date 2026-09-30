import Link from 'next/link';
import { currentAccount } from '@/lib/session';
import { isAdmin } from '@/lib/accounts';
import { TourHelp } from './tour';

export async function Nav({ back }: { back?: boolean }) {
  const account = await currentAccount();
  return (
    <header className="nav">
      {back ? <Link href="/">‹ Riders</Link> : <span className="brand">BMX Tracker <TourHelp /></span>}
      <nav>
        {isAdmin(account) ? <Link href="/admin">Admin</Link> : null}
        {account ? <Link href="/my-riders">My riders</Link> : null}
        <Link href="/search">Search</Link>
        <form method="post" action="/api/logout">
          <button type="submit" className="link">Sign out</button>
        </form>
      </nav>
    </header>
  );
}
