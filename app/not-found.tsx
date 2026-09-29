import Link from 'next/link';
import { Nav } from './nav';

export default function NotFound() {
  return (
    <>
      <Nav back />
      <main className="stack">
        <section className="card">
          <h1>Rider not found</h1>
          <p className="muted">USA BMX has no rider with that profile number. Try <Link href="/search">searching by name</Link>.</p>
        </section>
      </main>
    </>
  );
}
