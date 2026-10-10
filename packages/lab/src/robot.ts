import type { Build, SensorKind, SensorSource, TerrainId } from '@rivetrun/contracts';
import { ACTION_PROFILES, PARTS_BY_ID, PHYSICS, TERRAINS, deriveSpec, safeContactSpeedMps, type RobotSpec } from '@rivetrun/sim';

/** Every Lab constant that is not a part value. Part values come from the build, as on the rail. */
export const LAB_TUNING = {
  /** Fixed sim timestep, seconds. */
  dtS: 0.05,
  /** A loaded motor turns slower: speed falls by this share at full load. */
  loadSpeedDrop: 0.6,
  /** The camera sees a cone of ± 45° around the heading. */
  cameraHalfFovTan: 1,
  doorS: 1,
  bumpS: 0.6,
  fallS: 3,
  fallDamagePct: 25,
  collisionS: 1.5,
  tagStunS: 2,
  /** A robot that has just picked something up or taken it cannot be tagged for this long. */
  tagGraceS: 2,
  pickS: 1,
  dropS: 0.5,
  scanS: 1.5,
  sampleS: 2,
  /** Energy trigger with hysteresis, as on the rail: low under 10 % margin, fine again over 30 %. */
  energy: { lowPct: 10, okPct: 30 },
  /** A robot with nothing to do asks again after this long. */
  idleRetriggerS: 1,
  /** A robot held up by traffic that has not cleared asks again after this long. */
  heldRetriggerS: 3,
} as const;

export type Pace = 'full' | 'eco';

/** Full throttle and the rail's steady throttle: eco is slower and costs about 70 % of full per metre driven. */
export const PACE: Readonly<Record<Pace, { readonly speed: number; readonly power: number }>> = {
  full: { speed: ACTION_PROFILES.accelerate.speed, power: ACTION_PROFILES.accelerate.power },
  eco: { speed: ACTION_PROFILES.cruise.speed, power: ACTION_PROFILES.cruise.power },
};

/** What the build can sense on a grid. Ranges are metres, straight from the parts; 0 = not fitted. */
export interface SensorSuite {
  /** Brain v3 sources. Always starts with 'core'. */
  readonly sources: readonly SensorSource[];
  /** The four tiles next to the robot: wall or free. */
  readonly ultrasonic: boolean;
  /** One beam along the heading. */
  readonly tofM: number;
  /** All round, line of sight: walls and things that move. No labels, no drops. */
  readonly lidarM: number;
  /** A cone ahead, line of sight: labels, terrain, objects, drops. */
  readonly cameraM: number;
  /** All round from above: what the camera sees, over walls when there is no ceiling. */
  readonly droneM: number;
  /** Finds soil samples on the tiles next to the robot. */
  readonly probe: boolean;
  readonly imu: boolean;
  readonly bumper: boolean;
  /** Part sensor kinds fitted, for objects that need one to be picked or scanned. */
  readonly kinds: readonly SensorKind[];
}

export interface LabRobot {
  readonly spec: RobotSpec;
  readonly suite: SensorSuite;
  /** Contact at or below this speed does no damage. */
  readonly safeContactMps: number;
}

export function sensorSuite(build: Build, spec: RobotSpec = deriveSpec(build)): SensorSuite {
  const parts = build.sensors.flatMap((id) => PARTS_BY_ID.get(id) ?? []);
  const range = (match: (source: string | undefined, kind: SensorKind | undefined) => boolean): number =>
    Math.max(0, ...parts.filter((p) => match(p.effects.source, p.effects.sensor)).map((p) => p.effects.rangeM ?? 0));
  return {
    sources: spec.sources,
    ultrasonic: parts.some((p) => p.effects.sensor === 'ultrasonic' && (p.effects.source ?? 'ultrasonic') === 'ultrasonic'),
    tofM: range((source) => source === 'tof'),
    lidarM: range((source) => source === 'lidar'),
    cameraM: range((_, kind) => kind === 'camera'),
    droneM: range((_, kind) => kind === 'scout_drone'),
    probe: parts.some((p) => p.effects.sensor === 'moisture'),
    imu: parts.some((p) => p.effects.sensor === 'imu'),
    bumper: spec.sources.includes('bumper'),
    kinds: [...new Set(parts.flatMap((p) => (p.effects.sensor ? [p.effects.sensor] : [])))],
  };
}

export function deriveRobot(build: Build): LabRobot {
  const spec = deriveSpec(build);
  return { spec, suite: sensorSuite(build, spec), safeContactMps: safeContactSpeedMps(spec) };
}

export type TileMotion =
  | { readonly ok: true; readonly speedMps: number; readonly drawW: number }
  /** grip = the wheels spin · torque = the motor stalls · tip = steeper than the locomotion stands. */
  | { readonly ok: false; readonly reason: 'grip' | 'torque' | 'tip' };

const G = 9.81;
const DEG = Math.PI / 180;

/**
 * Steady speed and electrical draw of a build crossing one tile. Same forces as the rail (grip, rolling
 * resistance, sinkage, slope) and the same draw formula. Lab simplification: a ramp tile costs as a climb in
 * both directions, and a loaded motor is slower (`loadSpeedDrop`).
 */
export function tileMotion(spec: RobotSpec, terrain: TerrainId, slopeDeg: number, pace: Pace): TileMotion {
  const ground = TERRAINS[terrain];
  const normal = spec.massKg * G * Math.cos(slopeDeg * DEG);
  const sink = ground.sinkage * spec.sinkageFactor * (spec.massKg / PHYSICS.refMassKg);
  const need = spec.massKg * G * Math.sin(slopeDeg * DEG) + (ground.rollingResistance + PHYSICS.sinkageDrag * sink) * normal;
  const traction = ground.baseFriction * (spec.grip[terrain] ?? 1) * normal;
  const reason = slopeDeg > spec.maxSlopeDeg ? 'tip' : need > traction ? 'grip' : need > spec.motorForceN ? 'torque' : undefined;
  if (reason !== undefined) {
    // The winch hauls the robot up what it cannot drive, slowly.
    if (!spec.extras.includes('winch')) return { ok: false, reason };
    const haulW = spec.motorPowerW * PHYSICS.idleLoad + spec.winchPowerW;
    return { ok: true, speedMps: PHYSICS.winchSpeedMps, drawW: spec.basePowerW + haulW * PHYSICS.driveEnergyScale };
  }
  const load = Math.min(1, need / spec.motorForceN);
  const motorW = spec.motorPowerW * (PHYSICS.idleLoad + (1 - PHYSICS.idleLoad) * load) * PACE[pace].power;
  return {
    ok: true,
    speedMps: PACE[pace].speed * spec.topSpeedMps * (1 - LAB_TUNING.loadSpeedDrop * load),
    drawW: spec.basePowerW + motorW * PHYSICS.driveEnergyScale,
  };
}

/** Damage from driving into something solid at a speed, in %. Free at or below the safe contact speed. */
export function contactDamagePct(robot: LabRobot, speedMps: number, terrain: TerrainId): number {
  const over = Math.max(0, speedMps - robot.safeContactMps);
  return over ** 2 * PHYSICS.impactDamagePerMps2 * (0.5 + TERRAINS[terrain].impactRisk) * robot.spec.impactDamageFactor;
}

/** Sensing range in whole tiles; a fitted sensor always reaches the next tile. */
export function rangeTiles(rangeM: number, factor: number, tileM: number): number {
  return rangeM <= 0 ? 0 : Math.max(1, Math.floor((rangeM * factor) / tileM));
}
