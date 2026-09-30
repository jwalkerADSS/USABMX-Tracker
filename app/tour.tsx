'use client';

import { useCallback, useEffect, useState } from 'react';

type Step = { target?: string; title: string; body: React.ReactNode };

const SEEN = 'bmx-tour-seen';

// Written for someone new to the app and to BMX racing. Steps whose target isn't on the page are skipped.
const STEPS: Step[] = [
  {
    title: 'Welcome to BMX Tracker',
    body: 'This app keeps track of USA BMX race results for the riders you follow. This quick tour shows what everything on the screen means.',
  },
  {
    target: '.rider-card',
    title: 'Rider card',
    body: 'Each rider you follow gets a card like this one. Tap the rider’s name to open their own page.',
  },
  {
    target: '.rider-card .badge',
    title: 'Skill level',
    body: 'Riders race against others the same age and skill level. Novice is where everyone starts, then Intermediate, then Expert. Riders move up a level as they win more races.',
  },
  {
    target: '.rider-card .ranks',
    title: 'Rankings',
    body: (
      <>
        <p>Each box shows the rider’s rank (#) and points (pts).</p>
        <ul>
          <li><strong>District</strong>: your local area</li>
          <li><strong>State</strong>: the whole state</li>
          <li><strong>Gold Cup</strong>: a regional series with its own final</li>
          <li><strong>NAG</strong>: national, against riders the same age and level</li>
          <li><strong>National</strong>: against every rider in the country</li>
        </ul>
      </>
    ),
  },
  {
    target: '.rider-card .record',
    title: 'Wins and races',
    body: 'How many races the rider has won this season, out of how many they raced. Under it is their last race: the date, the track and where they finished.',
  },
  {
    target: '.rider-card .card-more',
    title: 'More detail',
    body: 'Opens the rider’s page: every race this season, the points from each one, their best tracks, and how many points they need to move up in the standings.',
  },
  {
    title: 'Racing words',
    body: (
      <ul>
        <li><strong>Moto</strong>: one race. Riders usually race a few motos, and the fastest move on to the main.</li>
        <li><strong>Main</strong>: the final race that decides the finishing order.</li>
        <li><strong>Win</strong>: 1st place. <strong>Podium</strong>: 2nd or 3rd.</li>
        <li><strong>Points</strong>: earned at every race, more for a better finish and a bigger race. Double and Triple point races count two or three times.</li>
      </ul>
    ),
  },
  {
    target: '.nav a[href="/search"]',
    title: 'Search',
    body: 'Find any USA BMX rider by name, look up a plate number like NV01 #63, or find races, like Nevada:Gold Cup or California:Nationals.',
  },
  {
    target: '.nav a[href="/my-riders"]',
    title: 'My riders',
    body: 'Add or remove the riders on this page, up to 5.',
  },
  {
    target: '.tour-link',
    title: 'That’s it!',
    body: 'Tap “How this app works” at the bottom of this page any time to see this tour again.',
  },
];

// A short walk through the landing page. It opens by itself on a device's first visit, and from the
// "How this app works" link after that.
export function Tour() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [at, setAt] = useState(-1);

  const start = useCallback(() => {
    setSteps(STEPS.filter(s => !s.target || document.querySelector(s.target)));
    setAt(0);
  }, []);

  const close = useCallback(() => {
    setAt(-1);
    try {
      localStorage.setItem(SEEN, '1');
    } catch {}
  }, []);

  useEffect(() => {
    let seen = true;
    try {
      seen = !!localStorage.getItem(SEEN);
    } catch {}
    if (!seen) start();
  }, [start]);

  // Spotlight the step's part of the page and scroll it into view.
  const step = at >= 0 ? steps[at] : undefined;
  const [sheetOnTop, setSheetOnTop] = useState(false);
  useEffect(() => {
    const el = step?.target ? document.querySelector(step.target) : null;
    el?.classList.add('tour-target');
    el?.scrollIntoView({ block: 'start' });
    // Something near the bottom of the page can't scroll up, so the sheet moves out of its way.
    setSheetOnTop(!!el && el.getBoundingClientRect().top > innerHeight / 2);
    return () => el?.classList.remove('tour-target');
  }, [step]);

  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [step, close]);

  const last = at === steps.length - 1;
  return (
    <>
      <button type="button" className="link tour-link" onClick={start}>How this app works</button>
      {step ? (
        <>
          {step.target ? null : <div className="tour-backdrop" onClick={close} />}
          <div className={`tour-sheet${sheetOnTop ? ' on-top' : ''}${step.target ? '' : ' tall'}`} role="dialog" aria-modal="true" aria-labelledby="tour-title">
            <div className="tour-top">
              <span className="muted small">{at + 1} of {steps.length}</span>
              <button type="button" className="link" onClick={close}>Skip tour</button>
            </div>
            <h2 id="tour-title">{step.title}</h2>
            <div className="tour-body">{step.body}</div>
            <div className="tour-buttons">
              {at > 0 ? <button type="button" className="secondary" onClick={() => setAt(at - 1)}>Back</button> : <span />}
              <button type="button" onClick={() => (last ? close() : setAt(at + 1))} autoFocus>{last ? 'Done' : 'Next'}</button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
