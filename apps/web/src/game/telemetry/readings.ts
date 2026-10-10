import type { Action, Build, Observation, SimState } from '@rivetrun/contracts';
import { ACTION_PROFILES, PARTS_BY_ID } from '@rivetrun/sim';
import { TERRAIN_LOOK } from '../palette';

export type ReadingTone = 'plain' | 'warn' | 'bad' | 'none';

/** One live value of the robot. `none` = the build has no sensor for it. */
export interface Reading {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** A second figure that belongs with the value. */
  readonly note?: string;
  /** Too long for half the sheet: the row takes the full width. */
  readonly wide?: boolean;
  readonly tone: ReadingTone;
}

/** Throttle and brake in force, 0–1. */
export interface Pedals {
  readonly throttle: number;
  readonly brake: number;
}

/** A brain's command as pedal positions, from the sim's own action profiles. */
export function pedalsOf(action: Action | null): Pedals {
  if (!action) return { throttle: 0, brake: 0 };
  if (action === 'brake') return { throttle: 0, brake: 1 };
  if (action === 'brake_soft') return { throttle: 0, brake: ACTION_PROFILES.brake_soft.force };
  return { throttle: Math.max(0, ACTION_PROFILES[action].speed), brake: 0 };
}

const RANGER_LABEL: Readonly<Record<string, string>> = { ultrasonic: 'SONAR', tof_vl53l1x_pololu: 'TOF', lidar_rplidar_c1: 'LIDAR' };

const NONE = 'no sensor';
const pct = (value: number): string => `${Math.round(value * 100)} %`;

interface ReadingsInput {
  readonly build: Build;
  readonly state: SimState | null;
  /** The latest Observation: per tick when the sim sends one, otherwise the one of the last question. */
  readonly observation: Observation | null;
  readonly pedals: Pedals;
}

/**
 * The robot's live values. Only what the build's sensors report: a row whose sensor is missing reads
 * "no sensor" (docs/BRAIN_V3_SENSING.md, Telemetry console).
 */
export function readingsOf({ build, state, observation: o, pedals }: ReadingsInput): Reading[] {
  const rows: Reading[] = [];
  const speed = o?.speedMps ?? state?.v ?? 0;
  rows.push({ key: 'speed', label: 'SPEED', value: `${speed.toFixed(2)} m/s`, tone: 'plain' });
  rows.push({ key: 'pedals', label: 'THROTTLE · BRAKE', value: `${pct(pedals.throttle)} · ${pct(pedals.brake)}`, tone: pedals.brake > 0 ? 'warn' : 'plain', wide: true });
  const battery = o?.batteryPct ?? state?.battery;
  const finish = o?.projectedFinishPct;
  rows.push({
    key: 'battery',
    label: 'BATTERY',
    value: battery === undefined ? '–' : `${Math.round(battery)} %`,
    note: finish === undefined ? undefined : finish < 0 ? 'runs out before the finish' : `finish ${Math.round(finish)} %`,
    tone: finish !== undefined && finish < 0 ? 'bad' : finish !== undefined && finish < 10 ? 'warn' : 'plain',
    wide: true,
  });
  rows.push({ key: 'draw', label: 'CURRENT DRAW', value: o ? `${o.drawW.toFixed(1)} W` : '–', tone: 'plain' });

  const hasImu = build.sensors.some((id) => PARTS_BY_ID.get(id)?.effects.sensor === 'imu');
  const slip = o?.slipPct;
  const tilt = o?.tiltDeg;
  rows.push(
    hasImu
      ? { key: 'slip', label: 'SLIP', value: typeof slip === 'number' ? `${Math.round(slip)} %` : '–', tone: typeof slip === 'number' && slip > 25 ? 'warn' : 'plain' }
      : { key: 'slip', label: 'SLIP', value: NONE, tone: 'none' },
    hasImu
      ? { key: 'tilt', label: 'TILT', value: typeof tilt === 'number' ? `${Math.round(tilt)}°` : '–', tone: typeof tilt === 'number' && Math.abs(tilt) >= 20 ? 'warn' : 'plain' }
      : { key: 'tilt', label: 'TILT', value: NONE, tone: 'none' },
  );

  // One row per ranger the build carries. The sim reports the nearest obstacle once; each ranger shows it when it is inside its own range.
  const rangers = build.sensors.flatMap((id) => {
    const part = PARTS_BY_ID.get(id);
    return part?.effects.sensor === 'ultrasonic' ? [{ id, label: RANGER_LABEL[id] ?? part.name.toUpperCase(), rangeM: part.effects.rangeM ?? 0 }] : [];
  });
  const hazard = o && typeof o.hazard === 'object' ? o.hazard : null;
  if (rangers.length === 0) rows.push({ key: 'ranger', label: 'OBSTACLE · RANGER', value: NONE, tone: 'none' });
  for (const ranger of rangers) {
    const seen = hazard !== null && hazard.distanceM <= ranger.rangeM;
    rows.push({
      key: `ranger:${ranger.id}`,
      label: `OBSTACLE · ${ranger.label}`,
      value: !o ? '–' : seen ? `${hazard.distanceM.toFixed(1)} m` : 'clear',
      tone: seen ? 'warn' : 'plain',
    });
  }

  // Any camera part counts (the NoIR module is one), and the drone sees further than either.
  const kinds = new Set(build.sensors.map((id) => PARTS_BY_ID.get(id)?.effects.sensor));
  const sees = kinds.has('scout_drone') ? 'drone' : kinds.has('camera') ? 'camera' : null;
  const ahead = o && typeof o.terrainAhead === 'object' ? o.terrainAhead : null;
  rows.push(
    sees
      ? {
          key: 'terrain',
          label: `TERRAIN AHEAD · ${sees.toUpperCase()}`,
          value: !o ? '–' : ahead ? `${TERRAIN_LOOK[ahead.terrain].label.toLowerCase()} · ${ahead.distanceM.toFixed(1)} m` : 'no change in range',
          tone: 'plain',
        }
      : { key: 'terrain', label: 'TERRAIN AHEAD', value: NONE, tone: 'none' },
  );
  const depth = o?.waterDepthCm;
  rows.push(
    build.sensors.some((id) => PARTS_BY_ID.get(id)?.effects.sensor === 'moisture')
      ? { key: 'depth', label: 'WATER DEPTH', value: typeof depth === 'number' ? `${Math.round(depth)} cm` : '–', tone: typeof depth === 'number' && depth > 20 ? 'warn' : 'plain' }
      : { key: 'depth', label: 'WATER DEPTH', value: NONE, tone: 'none' },
  );
  return rows;
}
