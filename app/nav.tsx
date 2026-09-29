import Link from 'next/link';

export function Nav({ back }: { back?: boolean }) {
  return (
    <header className="nav">
      {back ? <Link href="/">‹ Riders</Link> : <span className="brand">BMX Tracker</span>}
      <nav>
        <Link href="/search">Search</Link>
        <form method="post" action="/api/logout">
          <button type="submit" className="link">Sign out</button>
        </form>
      </nav>
    </header>
  );
}
