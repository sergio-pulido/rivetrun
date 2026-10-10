import type { Build, ExtraKind, Part, SensorKind, SensorSource, TerrainId } from '@rivetrun/contracts';
import { DUCTED_FAN, PARTS_BY_ID } from './data';

export const CHASSIS_MASS_KG = 1;
export const WHEEL_RADIUS_M = 0.05;

/** Everything the physics needs from a build, derived once per run. */
export interface RobotSpec {
  readonly massKg: number;
  readonly costEur: number;
  readonly topSpeedMps: number;
  readonly motorForceN: number;
  /** Multiplier on the throttle time constant: tall gearing and big wheels wind up slower, short gearing is snappier. 1 = stock. */
  readonly throttleLag: number;
  readonly motorPowerW: number;
  /** Always-on draw: sensors and locomotion electronics. */
  readonly basePowerW: number;
  readonly winchPowerW: number;
  /** Drawn only while swimming. */
  readonly thrusterPowerW: number;
  /** Deepest water the robot can swim through, cm. 0 = cannot swim (no thrusters, or thrusters without the case). */
  readonly maxSwimDepthCm: number;
  readonly capacityWh: number;
  readonly grip: Partial<Record<TerrainId, number>>;
  readonly sinkageFactor: number;
  readonly maxSlopeDeg: number;
  /** Deepest water the locomotion can drive through, cm. */
  readonly maxWadingDepthCm: number;
  readonly roughGroundFactor: number;
  /** Tallest obstacle the build gets over while driving normally, cm. */
  readonly clearanceCm: number;
  readonly wheelSizeMm: number;
  /** Multiplier on obstacle and rough-ground impacts from wheel size (bigger wheels roll over more). */
  readonly obstacleImpactFactor: number;
  /** Vertical launch speed of the jump part, m/s: the piston's kick, or the hop that starts a fan burn (0 = neither). */
  readonly jumpImpulseMps: number;
  readonly jumpCooldownS: number;
  /** Energy of one jump = this power for one second. */
  readonly jumpPowerW: number;
  /** Ducted fan: thrust while the jump button is held. Absent = no fan (or a piston is fitted: they share the button). */
  readonly fan?: { readonly liftN: number; readonly pushN: number; readonly burnS: number; readonly powerW: number };
  readonly sensorRangeM: Partial<Record<SensorKind, number>>;
  /** Brain v3: where this build's knowledge can come from. Always starts with 'core'. */
  readonly sources: readonly SensorSource[];
  /** The obstacle ranger with the longest reach, if any. */
  readonly rangerSource?: SensorSource;
  /** The longest-range camera on the build sees in the dark. */
  readonly nightVision?: boolean;
  /** A light sensor turns the headlights on in the dark. */
  readonly autoLights?: boolean;
  readonly extras: readonly ExtraKind[];
  readonly impactDamageFactor: number;
  readonly waterproof: boolean;
  readonly locomotionName: string;
}

function part(id: string): Part {
  const found = PARTS_BY_ID.get(id);
  if (!found) throw new Error(`@rivetrun/sim: unknown part "${id}"`);
  return found;
}

const KIND_SOURCE: Readonly<Record<SensorKind, SensorSource>> = { ultrasonic: 'ultrasonic', imu: 'imu', camera: 'camera', moisture: 'moisture_probe', scout_drone: 'scout_drone' };
const sourceOf = (sensor: Part): SensorSource => sensor.effects.source ?? KIND_SOURCE[sensor.effects.sensor ?? 'ultrasonic'];

/** Reasons a build cannot be deployed as intended (empty = fine). For the Workshop. */
export function buildIssues(build: Build): string[] {
  const extras = build.extras.map(part);
  const kinds = new Set(extras.map((p) => p.effects.extra));
  const missing = extras.flatMap((p) => {
    const needs = p.effects.requiresExtra;
    if (needs === undefined || kinds.has(needs)) return [];
    const needed = [...PARTS_BY_ID.values()].find((candidate) => candidate.effects.extra === needs);
    return [`${p.name} needs the ${needed?.name ?? needs}`];
  });
  // One jump button: the piston and the fan cannot both be on it. With both fitted the piston works and the fan is dead weight.
  const jumpers = extras.filter((p) => p.effects.extra === 'piston_jump' || p.effects.extra === 'ducted_fan');
  return jumpers.length > 1 ? [...missing, `${jumpers[0]!.name} and ${jumpers[1]!.name} share the jump button: fit one`] : missing;
}

/** Size L: the 90 mm wheel, the largest in the real parts list (docs/MK2_BOM.md). */
const WHEEL_L = { speed: 1.15, force: 0.87, massKg: 0.15, impact: 0.75, wading: 1.25, costEur: 10 } as const;

const CLEARANCE_BUMP_FACTOR = 1.5;

/** Gameplay v2 tuning. Every factor is 1 at the stock setting, so untuned builds drive exactly as before. */
export const BUILD_TUNING = {
  stockCells: 2,
  stockWheelMm: 80,
  stockGear: 3,
  /** Per wheel size: top speed, wheel force, extra mass, obstacle impact, wading depth, extra cost. */
  wheel: {
    60: { speed: 0.85, force: 1.18, massKg: -0.1, impact: 1.25, wading: 0.75, costEur: 0 },
    80: { speed: 1, force: 1, massKg: 0, impact: 1, wading: 1, costEur: 0 },
    90: WHEEL_L,
    /** Old value for L: builds saved before the BOM fixed the size at 90 mm drive exactly the same. */
    100: WHEEL_L,
  },
  /** Gear step 1 (speed) … 5 (torque). */
  gearSpeed: [1.3, 1.15, 1, 0.87, 0.75],
  gearForce: [0.77, 0.87, 1, 1.15, 1.33],
} as const;

export function deriveSpec(build: Build): RobotSpec {
  const locomotion = part(build.locomotion);
  const motor = part(build.motor);
  const battery = part(build.battery);
  const sensors = build.sensors.map(part);
  const extras = build.extras.map(part);
  const all = [locomotion, motor, battery, ...sensors, ...extras];
  const winch = extras.find((p) => p.effects.extra === 'winch');
  const piston = extras.find((p) => p.effects.extra === 'piston_jump');
  const fan = piston ? undefined : extras.find((p) => p.effects.extra === 'ducted_fan');
  const kinds = new Set(extras.map((p) => p.effects.extra));
  const thrusters = extras.find((p) => p.effects.maxSwimDepthCm !== undefined && (p.effects.requiresExtra === undefined || kinds.has(p.effects.requiresExtra)));
  const sensorRangeM: Partial<Record<SensorKind, number>> = {};
  for (const sensor of sensors) {
    // Two parts of one kind (ultrasonic + lidar are both obstacle rangers): the longer range wins.
    if (sensor.effects.sensor) sensorRangeM[sensor.effects.sensor] = Math.max(sensorRangeM[sensor.effects.sensor] ?? 0, sensor.effects.rangeM ?? 0);
  }
  const cameras = sensors.filter((p) => p.effects.sensor === 'camera').sort((a, b) => (b.effects.rangeM ?? 0) - (a.effects.rangeM ?? 0));
  const rangers = sensors.filter((p) => p.effects.sensor === 'ultrasonic').sort((a, b) => (b.effects.rangeM ?? 0) - (a.effects.rangeM ?? 0));
  // Cells scale the pack (capacity, mass, cost) and the voltage (speed, power, a little force).
  const cells = (build.batteryCells ?? BUILD_TUNING.stockCells) / BUILD_TUNING.stockCells;
  const cellCount = build.batteryCells ?? BUILD_TUNING.stockCells;
  const voltageSpeed = 0.6 + 0.2 * cellCount;
  const voltageForce = 0.85 + 0.075 * cellCount;
  // 100 is the old value for L (90 mm): one wheel, one radius.
  const wheelMm = build.wheelSizeMm === 100 ? 90 : (build.wheelSizeMm ?? BUILD_TUNING.stockWheelMm);
  const wheel = BUILD_TUNING.wheel[wheelMm];
  const gear = (build.gearStep ?? BUILD_TUNING.stockGear) - 1;
  const speedFactor = voltageSpeed * wheel.speed * BUILD_TUNING.gearSpeed[gear]!;
  const forceFactor = voltageForce * wheel.force * BUILD_TUNING.gearForce[gear]!;
  return {
    massKg: CHASSIS_MASS_KG + all.reduce((sum, p) => sum + p.massKg, 0) + battery.massKg * (cells - 1) + wheel.massKg,
    costEur: Math.round(all.reduce((sum, p) => sum + p.costEur, 0) + battery.costEur * (cells - 1) + wheel.costEur),
    topSpeedMps: (motor.effects.topSpeedMps ?? 2) * speedFactor,
    motorForceN: ((motor.effects.torqueNm ?? 1) / WHEEL_RADIUS_M) * forceFactor,
    throttleLag: speedFactor / forceFactor,
    motorPowerW: motor.powerW * cells,
    basePowerW: locomotion.powerW + sensors.reduce((sum, p) => sum + p.powerW, 0),
    winchPowerW: winch?.powerW ?? 0,
    thrusterPowerW: thrusters?.powerW ?? 0,
    maxSwimDepthCm: thrusters?.effects.maxSwimDepthCm ?? 0,
    capacityWh: (battery.effects.capacityWh ?? 0.5) * cells,
    grip: locomotion.effects.grip ?? {},
    sinkageFactor: locomotion.effects.sinkageFactor ?? 1,
    maxSlopeDeg: locomotion.effects.maxSlopeDeg ?? 20,
    maxWadingDepthCm: (locomotion.effects.maxWadingDepthCm ?? 25) * wheel.wading,
    roughGroundFactor: locomotion.effects.roughGroundFactor ?? 1,
    // Wheel radius, raised by tyre or track, with the half-radius of extra a rolling wheel can bump over.
    clearanceCm: (wheelMm / 20) * (locomotion.effects.clearanceFactor ?? 1) * CLEARANCE_BUMP_FACTOR,
    wheelSizeMm: wheelMm,
    obstacleImpactFactor: wheel.impact,
    jumpImpulseMps: piston?.effects.jumpImpulseMps ?? (fan ? DUCTED_FAN.hopMps : 0),
    jumpCooldownS: (piston ?? fan)?.effects.cooldownS ?? 0,
    jumpPowerW: piston?.powerW ?? 0,
    ...(fan ? { fan: { liftN: DUCTED_FAN.liftN, pushN: DUCTED_FAN.pushN, burnS: DUCTED_FAN.burnS, powerW: fan.powerW } } : {}),
    sensorRangeM,
    sources: ['core', ...new Set(sensors.filter((p) => p.effects.sensor !== undefined).map(sourceOf)), ...(extras.some((p) => p.effects.extra === 'bumper') ? (['bumper'] as const) : [])],
    rangerSource: rangers[0] ? sourceOf(rangers[0]) : undefined,
    ...(cameras[0]?.effects.nightVision ? { nightVision: true } : {}),
    ...(sensors.some((p) => p.effects.autoLights) ? { autoLights: true } : {}),
    extras: extras.flatMap((p) => (p.effects.extra ? [p.effects.extra] : [])),
    impactDamageFactor: extras.reduce((factor, p) => factor * (p.effects.impactDamageFactor ?? 1), 1),
    waterproof: extras.some((p) => p.effects.waterproof === true),
    locomotionName: locomotion.name,
  };
}
