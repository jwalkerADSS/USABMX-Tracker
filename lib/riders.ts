import 'server-only';
import tracked from '@/data/riders.json';
import type { Tables } from './usabmx';

export type TrackedRider = {
  name: string;
  memberId: number;
  profileId: number;
  altProfileIds?: number[];
  tables: Tables;
};

export const TRACKED: TrackedRider[] = tracked as TrackedRider[];

export function findTracked(profileId: number): TrackedRider | undefined {
  return TRACKED.find(r => r.profileId === profileId || r.altProfileIds?.includes(profileId));
}

export const currentSeason = () => new Date().getFullYear();
