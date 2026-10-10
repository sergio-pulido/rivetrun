// The mission's objectives (gameplay v3): scan zones, the sensor each needs, and whether this build can scan it.
import type { Build, Mission, Part } from '@rivetrun/contracts';
import * as sim from '@rivetrun/sim';
import { PARTS, PARTS_BY_ID, deriveSpec } from '@rivetrun/sim';

export interface Objective {
  readonly id: string;
  /** What is there to scan: "survivor", "soil sample", "structure". */
  readonly label: string;
  readonly atM: number;
  /** The parts that can scan it, any one: "Camera or Scout drone". */
  readonly needs: string;
  readonly canScan: boolean;
  /** The fitted part that scans it. */
  readonly with: string | null;
}

const anyOf = (names: readonly string[]): string => (names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : (names[0] ?? ''));
const senses = (part: Part, kinds: readonly string[]): boolean => part.effects.sensor !== undefined && kinds.includes(part.effects.sensor);

/** The mission's scan zones in track order. A build can scan a zone when it carries a sensor of a kind the zone accepts: the sim's rule. */
export function objectives(mission: Mission, build: Build): readonly Objective[] {
  const zones = mission.scanZones ?? [];
  if (zones.length === 0) return [];
  const carried = deriveSpec(build).sensorRangeM;
  const fitted = build.sensors.flatMap((id) => PARTS_BY_ID.get(id) ?? []);
  return [...zones]
    .sort((a, b) => a.atM - b.atM)
    .map((zone) => ({
      id: zone.id,
      label: zone.label,
      atM: zone.atM,
      needs: anyOf(PARTS.filter((part) => !part.comingSoon && senses(part, zone.needs)).map((part) => part.name)),
      canScan: zone.needs.some((kind) => carried[kind] !== undefined),
      with: fitted.find((part) => senses(part, zone.needs))?.name ?? null,
    }));
}

export interface ScanRules {
  /** Seconds to hold still on the zone. */
  readonly holdS: number;
  /** Seconds added to the time for each zone not scanned. */
  readonly missPenaltyS: number;
}

/** The sim's scan rules, when it exports them: how long to stop, and what a missed scan costs. */
export function scanRules(): ScanRules | null {
  const rules = (sim as unknown as { readonly SCAN_RULES?: { readonly holdS?: unknown; readonly missPenaltyS?: unknown } }).SCAN_RULES;
  return typeof rules?.holdS === 'number' && typeof rules.missPenaltyS === 'number' ? { holdS: rules.holdS, missPenaltyS: rules.missPenaltyS } : null;
}
