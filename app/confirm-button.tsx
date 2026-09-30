'use client';

import type { ReactNode } from 'react';

// A submit button that asks "are you sure?" first.
export function ConfirmButton({ message, className, children }: { message: string; className?: string; children: ReactNode }) {
  return (
    <button type="submit" className={className} onClick={e => { if (!confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
