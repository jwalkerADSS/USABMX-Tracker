'use client';

import { useState, type ReactNode } from 'react';

// A big race day has 100+ motos, so let people narrow them to a class or a rider's name.
export function MotoFilter({ count, children }: { count: number; children: ReactNode }) {
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(count);
  const filter = (value: string) => {
    setQ(value);
    const words = value.toLowerCase().split(/\s+/).filter(Boolean);
    let n = 0;
    document.querySelectorAll<HTMLElement>('.moto-list [data-search]').forEach(el => {
      const hit = words.every(w => el.dataset.search!.includes(w));
      el.hidden = !hit;
      if (hit) n++;
    });
    setShown(n);
  };
  return (
    <>
      {count > 8 ? (
        <div className="moto-filter">
          <input value={q} onChange={e => filter(e.target.value)} placeholder="Filter by class or rider, e.g. 7 girls" enterKeyHint="search" />
          {q ? <span className="muted small">{shown} of {count} motos</span> : null}
        </div>
      ) : null}
      <div className="moto-list stack">{children}</div>
    </>
  );
}
