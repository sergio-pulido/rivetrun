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

export interface ScanFix {
  readonly partId: string;
  readonly name: string;
  /** Points to unlock it; 0 = free. */
  readonly unlockPoints: number;
  /** The fitted sensor that has to come off to make room for it; null when there is a free slot. */
  readonly replaces: string | null;
}

/** Sensor slots on a robot: the sim's limit, read off its build rules by the UI's own constant would drift, so it is passed in. */
export interface FixOptions {
  readonly maxSensors: number;
}

/**
 * The sensors that would let this build scan a zone it cannot scan now, by the sim's own verdict: each playable sensor is
 * tried in a free slot, or in place of each fitted sensor in turn. Empty when the build can already scan it.
 */
export function scanFixes(mission: Mission, build: Build, zoneId: string, options: FixOptions): readonly ScanFix[] {
  const zone = (mission.scanZones ?? []).find((entry) => entry.id === zoneId);
  if (!zone || scans(build, mission, zone)) return [];
  const candidates = PARTS.filter((part) => part.slot === 'sensor' && !part.comingSoon && !build.sensors.includes(part.id));
  return candidates.flatMap((part): ScanFix[] => {
    const room = build.sensors.length < options.maxSensors;
    const variants: readonly { readonly sensors: readonly string[]; readonly out: string | null }[] = room
      ? [{ sensors: [...build.sensors, part.id], out: null }]
      : build.sensors.map((out) => ({ sensors: [...build.sensors.filter((id) => id !== out), part.id], out }));
    const works = variants.find((variant) => scans({ ...build, sensors: [...variant.sensors] } as Build, mission, zone));
    return works ? [{ partId: part.id, name: part.name, unlockPoints: part.unlockPoints, replaces: works.out ? (PARTS_BY_ID.get(works.out)?.name ?? null) : null }] : [];
  });
}

/** A part name inside a sentence: "Light sensor" → "light sensor", while names that start with an acronym ("NoIR camera", "ToF ranger") keep their capitals. */
export function midSentence(name: string): string {
  const first = name.split(' ')[0] ?? '';
  return /^[A-Z][a-z]+$/.test(first) ? `${name.charAt(0).toLowerCase()}${name.slice(1)}` : name;
}

/** "the light sensor costs 50 points and the NoIR camera 200": the parts still locked, cheapest first. Null when none is. */
export function lockedLine(fixes: readonly ScanFix[], isUnlocked: (partId: string) => boolean): { readonly text: string; readonly total: number; readonly count: number } | null {
  const locked = fixes.filter((fix) => fix.unlockPoints > 0 && !isUnlocked(fix.partId)).sort((a, b) => a.unlockPoints - b.unlockPoints);
  if (locked.length === 0) return null;
  const parts = locked.map((fix, index) => `the ${midSentence(fix.name)} ${index === 0 ? `costs ${fix.unlockPoints} points` : `${fix.unlockPoints}`}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]!;
  return { text: `Locked: ${list}.`, total: locked.reduce((sum, fix) => sum + fix.unlockPoints, 0), count: locked.length };
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
