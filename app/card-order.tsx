'use client';

import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { reorderRiders } from './auth-actions';

const HOLD_MS = 450;
const SLOP_PX = 10; // moving further than this before the hold ends means the finger is scrolling
const EDGE_PX = 70; // dragging this close to the top or bottom of the screen scrolls the page

type Drag = { id: number; grab: number; y: number; el: HTMLElement };

// Press and hold a rider card, then drag it up or down to change the order. The order saves with the
// account, so it's the same on every phone and browser the user signs in on.
export function CardOrder({ ids, children }: { ids: number[]; children: ReactNode }) {
  const cards = Children.toArray(children);
  const byId = new Map(ids.map((id, i) => [id, cards[i]]));
  const [order, setOrder] = useState(ids);
  const [dragging, setDragging] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const slots = useRef(new Map<number, HTMLDivElement>());
  const press = useRef<{ id: number; x: number; y: number; timer: number } | null>(null);
  const justDropped = useRef(false);
  const orderRef = useRef(order);
  orderRef.current = order;

  const key = ids.join(',');
  useEffect(() => setOrder(key.split(',').map(Number)), [key]);

  // Keep the lifted card under the finger: its natural spot moves each time the others shuffle past it.
  const place = () => {
    const d = drag.current;
    if (!d) return;
    const current = Number(d.el.style.getPropertyValue('--drag-y') || 0);
    const natural = d.el.getBoundingClientRect().top - current;
    d.el.style.setProperty('--drag-y', `${d.y - d.grab - natural}px`);
  };
  useLayoutEffect(place, [order]);

  const move = (y: number) => {
    const d = drag.current;
    if (!d) return;
    d.y = y;
    const list = orderRef.current;
    const from = list.indexOf(d.id);
    let to = from;
    list.forEach((id, i) => {
      if (id === d.id) return;
      const r = slots.current.get(id)?.getBoundingClientRect();
      if (!r) return;
      const mid = r.top + r.height / 2;
      if (i < from && y < mid) to = Math.min(to, i);
      if (i > from && y > mid) to = Math.max(to, i);
    });
    if (to !== from) {
      const next = list.filter(id => id !== d.id);
      next.splice(to, 0, d.id);
      setOrder(next);
    } else place();
  };

  const lift = (id: number, y: number) => {
    const el = slots.current.get(id);
    if (!el) return;
    drag.current = { id, grab: y - el.getBoundingClientRect().top, y, el };
    el.style.setProperty('--drag-y', '0px');
    setDragging(id);
    navigator.vibrate?.(15);
  };

  const drop = () => {
    const d = drag.current;
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
    if (!d) return;
    drag.current = null;
    d.el.style.removeProperty('--drag-y');
    setDragging(null);
    justDropped.current = true;
    setTimeout(() => (justDropped.current = false), 400);
    const next = orderRef.current;
    if (next.join(',') !== ids.join(',')) reorderRiders(next).catch(() => setOrder(ids));
  };

  const start = (id: number, x: number, y: number) => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = { id, x, y, timer: window.setTimeout(() => lift(id, press.current?.y ?? y), HOLD_MS) };
  };
  const track = (x: number, y: number) => {
    const p = press.current;
    if (drag.current) return move(y);
    if (p && Math.hypot(x - p.x, y - p.y) > SLOP_PX) {
      clearTimeout(p.timer);
      press.current = null;
    } else if (p) p.y = y;
  };

  // While a card is lifted: stop the page scrolling under the finger, scroll near the edges instead.
  useEffect(() => {
    if (dragging == null) return;
    const touchMove = (e: TouchEvent) => {
      e.preventDefault();
      move(e.touches[0].clientY);
    };
    const mouseMove = (e: MouseEvent) => move(e.clientY);
    let frame = 0;
    const edgeScroll = () => {
      const d = drag.current;
      if (d) {
        const step = d.y < EDGE_PX ? -12 : d.y > window.innerHeight - EDGE_PX ? 12 : 0;
        if (step) {
          window.scrollBy(0, step);
          move(d.y);
        }
      }
      frame = requestAnimationFrame(edgeScroll);
    };
    frame = requestAnimationFrame(edgeScroll);
    document.addEventListener('touchmove', touchMove, { passive: false });
    document.addEventListener('mousemove', mouseMove);
    document.addEventListener('touchend', drop);
    document.addEventListener('touchcancel', drop);
    document.addEventListener('mouseup', drop);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('touchmove', touchMove);
      document.removeEventListener('mousemove', mouseMove);
      document.removeEventListener('touchend', drop);
      document.removeEventListener('touchcancel', drop);
      document.removeEventListener('mouseup', drop);
    };
  }, [dragging]);

  if (ids.length < 2) return <>{children}</>;
  return (
    <div className={`card-order${dragging != null ? ' is-dragging' : ''}`}>
      {order.map(id => (
        <div
          key={id}
          ref={el => { if (el) slots.current.set(id, el); else slots.current.delete(id); }}
          className={`card-slot${dragging === id ? ' lifted' : ''}`}
          onTouchStart={e => start(id, e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={e => track(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={() => { if (!drag.current) drop(); }}
          onMouseDown={e => { if (e.button === 0) start(id, e.clientX, e.clientY); }}
          onMouseMove={e => track(e.clientX, e.clientY)}
          onMouseUp={() => { if (!drag.current) drop(); }}
          onContextMenu={e => { if (press.current || drag.current) e.preventDefault(); }}
          onDragStart={e => e.preventDefault()}
          // A drop shouldn't also open the link the finger was resting on.
          onClickCapture={e => { if (justDropped.current) { e.preventDefault(); e.stopPropagation(); } }}
        >
          {byId.get(id)}
        </div>
      ))}
      <p className="muted small order-hint">Press and hold a card, then drag it to change the order.</p>
    </div>
  );
}
