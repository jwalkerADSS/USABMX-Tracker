import 'server-only';
import { cache } from 'react';
import tracked from '@/data/riders.json';
import { findIndexed } from './search';
import { findTables, getPoints, getProfile, type Tables } from './usabmx';

export type TrackedRider = {
  name: string;
  memberId: number;
  profileId: number;
  altProfileIds?: number[];
  tables: Tables;
  // Sqorz transponder codes (e.g. "GC-12345"): every lap they've done, at any Sqorz track.
  transponders?: string[];
};

export const TRACKED: TrackedRider[] = tracked as TrackedRider[];

export function findTracked(profileId: number): TrackedRider | undefined {
  return TRACKED.find(r => r.profileId === profileId || r.altProfileIds?.includes(profileId));
}

export const currentSeason = () => new Date().getFullYear();

// Any rider's standings tables: the family's are listed in riders.json, everyone else's are worked
// out from their profile, using the search index for their district and Boys/Girls when it has them.
export const getRiderTables = cache(async (profileId: number): Promise<TrackedRider | null> => {
  const listed = findTracked(profileId);
  if (listed) return listed;
  const [profile, points] = await Promise.all([
    getProfile(profileId).catch(() => null),
    getPoints(profileId).catch(() => null),
  ]);
  if (!profile || !points) return null;
  const indexed = findIndexed(profileId);
  const gender = indexed?.sources.map(s => s.class).find((c): c is 'Boys' | 'Girls' => c === 'Boys' || c === 'Girls');
  const tables = await findTables(profile, points, currentSeason(), { district: indexed?.district ?? undefined, gender });
  return { name: `${profile.firstName} ${profile.lastName}`, memberId: profile.memberId, profileId, tables };
});
