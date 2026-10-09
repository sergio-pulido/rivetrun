import type { Build, Part, PartId, Slot } from '@rivetrun/contracts';
import { PARTS } from '@rivetrun/sim';
import { TERRAIN_LOOK } from '@/game/palette';
import { MAX_EXTRAS, MAX_SENSORS } from '@/ui/buildStats';
import type { IconName } from '@/ui/Icon';

export interface SlotInfo {
  readonly slot: Slot;
  readonly label: string;
  readonly icon: IconName;
  readonly rule: string;
}

export const SLOTS: readonly SlotInfo[] = [
  { slot: 'locomotion', label: 'Drive', icon: 'wheel', rule: 'Pick one' },
  { slot: 'motor', label: 'Motor', icon: 'motor', rule: 'Pick one' },
  { slot: 'battery', label: 'Battery', icon: 'battery', rule: 'Pick one' },
  { slot: 'sensor', label: 'Sensors', icon: 'sensor', rule: `Up to ${MAX_SENSORS}: what the AI can know` },
  { slot: 'extra', label: 'Extras', icon: 'extra', rule: `Up to ${MAX_EXTRAS}` },
];

export const partsIn = (slot: Slot): readonly Part[] => PARTS.filter((part) => part.slot === slot);

export function fitted(build: Build, slot: Slot): readonly PartId[] {
  if (slot === 'sensor') return build.sensors;
  if (slot === 'extra') return build.extras;
  return [build[slot]];
}

/** Adds to a two-part slot; a third part pushes out the oldest. Tapping a fitted part removes it. */
const toggle = (list: readonly PartId[], id: PartId, max: number): PartId[] =>
  list.includes(id) ? list.filter((other) => other !== id) : [...list, id].slice(-max);

/** The build after tapping a part. Never mutates the input. */
export function withPart(build: Build, part: Part): Build {
  if (part.slot === 'sensor') return { ...build, sensors: toggle(build.sensors, part.id, MAX_SENSORS) };
  if (part.slot === 'extra') return { ...build, extras: toggle(build.extras, part.id, MAX_EXTRAS) };
  return { ...build, [part.slot]: part.id };
}

/** The numbers that matter for a part, straight from its effect fields. */
export function specLine(part: Part): string {
  const { effects } = part;
  if (part.slot === 'locomotion') {
    const grips = Object.entries(effects.grip ?? {}) as [keyof typeof TERRAIN_LOOK, number][];
    const best = [...grips].sort((a, b) => b[1] - a[1])[0];
    const worst = [...grips].sort((a, b) => a[1] - b[1])[0];
    return [
      `slopes ≤${effects.maxSlopeDeg}°`,
      best && best[1] > 1 ? `${TERRAIN_LOOK[best[0]].label.toLowerCase()} ×${best[1]}` : null,
      worst && worst[1] < 1 ? `${TERRAIN_LOOK[worst[0]].label.toLowerCase()} ×${worst[1]}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (part.slot === 'motor') return `${effects.topSpeedMps} m/s top · ${effects.torqueNm} N·m`;
  if (part.slot === 'battery') return `${effects.capacityWh} Wh`;
  if (part.slot === 'sensor') return effects.rangeM ? `range ${effects.rangeM} m` : 'always on';
  if (effects.impactDamageFactor !== undefined) return `impact damage ×${effects.impactDamageFactor}`;
  if (effects.waterproof) return 'water damage ×0';
  return 'adds an action for the AI';
}
