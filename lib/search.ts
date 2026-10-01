import 'server-only';
import index from '@/data/rider-index.json';

export type IndexedRider = {
  profileId: number;
  memberId: number | null;
  name: string;
  ageGroup: string | null;
  district: string | null;
  sources: { table: string; class: string; district?: string; place: number; points: number }[];
};

const riders = (index as { riders: IndexedRider[] }).riders;
export const indexBuiltAt = (index as { builtAt: string | null }).builtAt;
export const indexSize = riders.length;

// Every word typed must appear in the rider's name, in any order.
export function searchRiders(query: string, limit = 50): IndexedRider[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return riders.filter(r => {
    const name = r.name.toLowerCase();
    return words.every(w => name.includes(w));
  }).slice(0, limit);
}

// By profile id, or by member id for riders listed under an older duplicate profile.
export function findIndexed(profileId: number, memberId?: number): IndexedRider | undefined {
  return riders.find(r => r.profileId === profileId) ?? (memberId ? riders.find(r => r.memberId === memberId) : undefined);
}
