import type { GoldCupFinal, Plate, Points } from './usabmx';

type Series = 'district' | 'state' | 'goldCup' | 'nag' | 'national';
const ORDER: Series[] = ['district', 'state', 'goldCup', 'nag', 'national'];
const BIKES = ['class', 'cruiser'] as const;
const BIKE_LABEL = { class: 'Class', cruiser: 'Cruiser' };

function series(type: string): Series | null {
  if (/district/i.test(type)) return 'district';
  if (/state|provincial/i.test(type)) return 'state';
  if (/gold/i.test(type)) return 'goldCup';
  if (/n\.?\s?a\.?\s?g/i.test(type)) return 'nag';
  if (/national/i.test(type)) return 'national';
  return null;
}

// The plates a rider holds this season, class then cruiser within each series, in the order District, State (each
// state), Gold Cup, NAG, National: "District #4 (Class)", "State (NV) #1 (Cruiser)", "Gold Cup (SW) #2 (Class)".
// Gold Cup (Josh's rule): before the rider's region holds its Gold Cup Final, show their current Gold Cup rank;
// once it's over, the plate from that final, or a dash if they raced Gold Cup but didn't earn one.
export function currentPlates(points: Points, finals: GoldCupFinal[], year: number, today = new Date().toISOString().slice(0, 10)): string[] {
  const out: { at: number; bike: number; text: string }[] = [];
  const add = (s: Series, bike: (typeof BIKES)[number], label: string, value: string) =>
    out.push({ at: ORDER.indexOf(s), bike: BIKES.indexOf(bike), text: `${label} ${value} (${BIKE_LABEL[bike]})` });
  const name = (s: Series, p: Plate) =>
    s === 'district' ? 'District' : s === 'state' ? `State${p.regionAbbr ? ` (${p.regionAbbr})` : ''}` : s === 'nag' ? 'NAG' : 'National';

  for (const bike of BIKES) {
    const plates = points.plates.filter(p => p.bike === bike);
    for (const p of plates) {
      const s = series(p.plateType);
      if (s && s !== 'goldCup') add(s, bike, name(s, p), `#${p.value}`);
    }
    const gcPoints = points[bike].find(p => series(p.type) === 'goldCup');
    const gcPlate = plates.find(p => series(p.plateType) === 'goldCup');
    const region = gcPlate?.regionAbbr ?? gcPoints?.type.match(/\(([^)]+)\)/)?.[1] ?? null;
    if (!region || (!gcPoints && !gcPlate)) continue;
    const label = `Gold Cup (${region})`;
    const final = finals.find(f => f.region === region);
    if (final && today > final.ends) {
      add('goldCup', bike, label, gcPlate && gcPlate.season === String(year) ? `#${gcPlate.value}` : '–');
    } else if (gcPoints) {
      add('goldCup', bike, label, gcPoints.rank ? `#${gcPoints.rank}` : '–');
    }
  }
  return out.sort((a, b) => a.at - b.at || a.bike - b.bike).map(x => x.text);
}
