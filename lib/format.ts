export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// USA BMX district standings group riders by the age they turn this year (e.g. born Oct 2015 races the
// 2026 district table as 11, even while still 10 on race day).
export function districtAge(birthdate: string | null, season: number): number | null {
  const year = birthdate ? Number(birthdate.slice(0, 4)) : NaN;
  return Number.isFinite(year) && year > 1900 ? season - year : null;
}

export const num = (n: number) => n.toLocaleString('en-US');

export const pts = (n: number) => `${num(n)} ${n === 1 ? 'pt' : 'pts'}`;
