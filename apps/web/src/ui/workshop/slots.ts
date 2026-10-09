import type { Build, Part, PartId, Slot } from '@rivetrun/contracts';
import { PARTS } from '@rivetrun/sim';
import { MAX_EXTRAS, MAX_SENSORS } from '@/ui/buildStats';
import type { IconName } from '@/ui/Icon';

export interface SlotInfo {
  readonly slot: Slot;
  readonly label: string;
  readonly icon: IconName;
  readonly rule: string;
  /** How many parts the slot holds. */
  readonly max: number;
}

export const SLOTS: readonly SlotInfo[] = [
  { slot: 'locomotion', label: 'Drive', icon: 'wheel', rule: 'Pick one', max: 1 },
  { slot: 'motor', label: 'Motor', icon: 'motor', rule: 'Pick one', max: 1 },
  { slot: 'battery', label: 'Battery', icon: 'battery', rule: 'Pick one', max: 1 },
  { slot: 'sensor', label: 'Sensors', icon: 'sensor', rule: `Up to ${MAX_SENSORS}: what the AI can know`, max: MAX_SENSORS },
  { slot: 'extra', label: 'Extras', icon: 'extra', rule: `Up to ${MAX_EXTRAS}`, max: MAX_EXTRAS },
];

/** Parts the sim ships in its data before their behaviour exists carry `comingSoon`; the Workshop does not offer them. */
export const isComingSoon = (part: Part): boolean => part.comingSoon === true;

/** The parts the Workshop offers for a slot. */
export const partsIn = (slot: Slot): readonly Part[] => PARTS.filter((part) => part.slot === slot && !isComingSoon(part));

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

/** Parts in a two-part slot can come off; drive, motor and battery can only be swapped. */
export const isRemovable = (part: Part): boolean => part.slot === 'sensor' || part.slot === 'extra';
