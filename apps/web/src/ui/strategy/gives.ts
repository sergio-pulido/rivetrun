import type { TerrainId } from '@rivetrun/contracts';
import { TERRAINS } from '@rivetrun/sim';
import type { CapabilityId, CapabilityItem } from './sim';

/** Differences smaller than this are rounding, not a change the player would notice. */
const NOTICEABLE = 0.005;

export interface GivesChip {
  readonly id: CapabilityId;
  /** What the rover can do with the part, in the sim's words. When the part takes an ability away: what it loses. */
  readonly text: string;
  /** What it could do without the part, when it could do something. */
  readonly without: string | null;
  readonly direction: 'better' | 'worse' | 'same';
}

/** What changes for the rover between two builds: with the part, and without it (or with the part it replaces). Biggest gains first. */
export function capabilityDiff(withPart: readonly CapabilityItem[], withoutPart: readonly CapabilityItem[]): readonly GivesChip[] {
  const before = new Map(withoutPart.map((item) => [item.id, item]));
  const after = new Map(withPart.map((item) => [item.id, item]));
  const ids = [...new Set([...after.keys(), ...before.keys()])];
  return ids
    .flatMap((id): (GivesChip & { readonly gain: number })[] => {
      const [now, was] = [after.get(id), before.get(id)];
      const [nowValue, wasValue] = [now?.value ?? 0, was?.value ?? 0];
      if (Math.abs(nowValue - wasValue) < NOTICEABLE) return [];
      const gain = (nowValue - wasValue) / Math.max(Math.abs(nowValue), Math.abs(wasValue), NOTICEABLE);
      // An ability the part removes altogether has no label of its own: name what is lost.
      const text = now ? now.label : `Loses: ${was!.label.charAt(0).toLowerCase()}${was!.label.slice(1)}`;
      return [{ id, text, without: now && was ? was.label : null, direction: nowValue > wasValue ? 'better' : 'worse', gain }];
    })
    .sort((a, b) => b.gain - a.gain)
    .map(({ gain: _gain, ...chip }) => chip);
}

/** Chosen abilities of a build stated on their own, for a part every rover has one of and that is already fitted. */
export function capabilityHeadlines(items: readonly CapabilityItem[], ids: readonly CapabilityId[]): readonly GivesChip[] {
  return ids.flatMap((id): GivesChip[] => {
    const item = items.find((candidate) => candidate.id === id);
    return item ? [{ id, text: item.label, without: null, direction: 'same' }] : [];
  });
}

const isTraction = (id: CapabilityId): id is `traction:${TerrainId}` => id.startsWith('traction:');
const terrainOf = (id: `traction:${TerrainId}`): TerrainId => id.slice('traction:'.length) as TerrainId;
// "Rock" is both a ground and an obstacle: the ground gets the longer name.
const terrainName = (terrain: TerrainId): string => (terrain === 'rock' ? 'rocky ground' : TERRAINS[terrain].name.toLowerCase());

/** What each kind of capability helps with on a track: obstacle types and crossings. Grip is named by its terrain instead. */
const GOOD_FOR: Readonly<Partial<Record<CapabilityId, readonly string[]>>> = {
  clearance: ['rocks', 'steps', 'logs'],
  climb: ['slopes'],
  top_speed: ['ramps'],
  ramp_speed: ['ramps'],
  wading: ['shallow water'],
  waterproof: ['water', 'deep mud'],
  thrust: ['deep water'],
  jump: ['gaps'],
  protection: ['hard hits'],
  lookahead_obstacle: ['obstacles ahead'],
  lookahead_terrain: ['terrain changes'],
  lookahead_depth: ['unknown water depth'],
  range: ['long tracks'],
};

/** Terrain and obstacle types the part helps with: everything it makes better. */
export function goodFor(chips: readonly GivesChip[]): readonly string[] {
  const better = chips.filter((chip) => chip.direction === 'better').map((chip) => chip.id);
  return [...new Set(better.flatMap((id) => (isTraction(id) ? [terrainName(terrainOf(id))] : (GOOD_FOR[id] ?? []))))];
}

/** The terrains a build grips best on, strongest first. */
export function bestTerrains(items: readonly CapabilityItem[], count: number): readonly string[] {
  return items
    .flatMap((item) => (isTraction(item.id) ? [{ name: terrainName(terrainOf(item.id)), value: item.value }] : []))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map((entry) => entry.name);
}
