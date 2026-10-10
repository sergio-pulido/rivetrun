// The mission's objectives (gameplay v3): scan zones, the sensor each needs, and whether this build can scan it.
import type { Build, Mission, Part } from '@rivetrun/contracts';
import * as sim from '@rivetrun/sim';
import { PARTS, PARTS_BY_ID, canScanZone, deriveSpec, weatherEffects } from '@rivetrun/sim';

export interface Objective {
  readonly id: string;
  /** What is there to scan: "survivor", "soil sample", "structure". */
  readonly label: string;
  readonly atM: number;
  /** The parts that can scan it, any one: "Camera or Scout drone". */
  readonly needs: string;
  readonly canScan: boolean;
  /** The fitted part of a kind the zone accepts. */
  readonly with: string | null;
  /** Why a build that carries such a part still cannot scan it here (e.g. a camera at night), in the sim's words. */
  readonly blocked: string | null;
}

const anyOf = (names: readonly string[]): string => (names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : (names[0] ?? ''));
const senses = (part: Part, kinds: readonly string[]): boolean => part.effects.sensor !== undefined && kinds.includes(part.effects.sensor);

/** The sim's verdict on one zone for this build on this mission (it knows about night and the like); its plain sensor rule if it cannot say. */
function scans(build: Build, mission: Mission, zone: NonNullable<Mission['scanZones']>[number]): boolean {
  try {
    return canScanZone(build, mission, zone);
  } catch {
    const carried = deriveSpec(build).sensorRangeM;
    return zone.needs.some((kind) => carried[kind] !== undefined);
  }
}

/** The sim's sentence on why scanning is blocked on this mission, when it has one. */
function scanBlockedReason(build: Build, mission: Mission): string | null {
  try {
    return weatherEffects(build, mission).find((effect) => effect.id.endsWith('_scan'))?.detail ?? null;
  } catch {
    return null;
  }
}

/** The mission's scan zones in track order, each with the sim's verdict on whether this build can scan it there. */
export function objectives(mission: Mission, build: Build): readonly Objective[] {
  const zones = mission.scanZones ?? [];
  if (zones.length === 0) return [];
  const fitted = build.sensors.flatMap((id) => PARTS_BY_ID.get(id) ?? []);
  const reason = scanBlockedReason(build, mission);
  return [...zones]
    .sort((a, b) => a.atM - b.atM)
    .map((zone) => {
      const canScan = scans(build, mission, zone);
      const carried = fitted.find((part) => senses(part, zone.needs))?.name ?? null;
      return {
        id: zone.id,
        label: zone.label,
        atM: zone.atM,
        needs: anyOf(PARTS.filter((part) => !part.comingSoon && senses(part, zone.needs)).map((part) => part.name)),
        canScan,
        with: carried,
        // It carries the right kind of sensor and still cannot scan: the conditions are why.
        blocked: !canScan && carried ? (reason ?? `Your ${carried.toLowerCase()} cannot scan it in this mission's conditions.`) : null,
      };
    });
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
