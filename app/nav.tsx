import Link from 'next/link';
import { currentAccount } from '@/lib/session';

export async function Nav({ back }: { back?: boolean }) {
  const account = await currentAccount();
  return (
    <header className="nav">
      {back ? <Link href="/">‹ Riders</Link> : <span className="brand">BMX Tracker</span>}
      <nav>
        {account ? <Link href="/my-riders">My riders</Link> : null}
        <Link href="/search">Search</Link>
        <form method="post" action="/api/logout">
          <button type="submit" className="link">Sign out</button>
        </form>
      </nav>
    </header>
  );
}
