'use client';

import { useEffect, useState, type ReactNode } from 'react';

// A card with a − / + button in its corner to hide or show it. A hidden card shrinks to one line with its
// title, so it's clear what's hidden. Remembered on this device (per section, for every rider) until shown again.
export function Fold({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const key = `fold:${id}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { setHidden(localStorage.getItem(key) === '1'); } catch { /* storage blocked: start shown */ }
  }, [key]);
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    try { if (next) localStorage.setItem(key, '1'); else localStorage.removeItem(key); } catch { /* not remembered */ }
  };
  return (
    <section className={`card fold${hidden ? ' folded' : ''}`} id={id}>
      <button type="button" className="fold-toggle" onClick={toggle} aria-expanded={!hidden} aria-label={`${hidden ? 'Show' : 'Hide'} ${title}`}>
        {hidden ? '+' : '−'}
      </button>
      {hidden ? (
        <p className="fold-placeholder" onClick={toggle}><strong>{title}</strong> <span className="muted small">hidden, tap + to show</span></p>
      ) : children}
    </section>
  );
}
