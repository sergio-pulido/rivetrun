import type { Build, ExtraKind, Part, SensorKind, TerrainId } from '@rivetrun/contracts';
import { PARTS_BY_ID } from './data';

export const CHASSIS_MASS_KG = 1;
export const WHEEL_RADIUS_M = 0.05;

/** Everything the physics needs from a build, derived once per run. */
export interface RobotSpec {
  readonly massKg: number;
  readonly costEur: number;
  readonly topSpeedMps: number;
  readonly motorForceN: number;
  readonly motorPowerW: number;
  /** Always-on draw: sensors and locomotion electronics. */
  readonly basePowerW: number;
  readonly winchPowerW: number;
  readonly capacityWh: number;
  readonly grip: Partial<Record<TerrainId, number>>;
  readonly sinkageFactor: number;
  readonly maxSlopeDeg: number;
  readonly roughGroundFactor: number;
  readonly sensorRangeM: Partial<Record<SensorKind, number>>;
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

export function deriveSpec(build: Build): RobotSpec {
  const locomotion = part(build.locomotion);
  const motor = part(build.motor);
  const battery = part(build.battery);
  const sensors = build.sensors.map(part);
  const extras = build.extras.map(part);
  const all = [locomotion, motor, battery, ...sensors, ...extras];
  const winch = extras.find((p) => p.effects.extra === 'winch');
  const sensorRangeM: Partial<Record<SensorKind, number>> = {};
  for (const sensor of sensors) {
    if (sensor.effects.sensor) sensorRangeM[sensor.effects.sensor] = sensor.effects.rangeM ?? 0;
  }
  return {
    massKg: CHASSIS_MASS_KG + all.reduce((sum, p) => sum + p.massKg, 0),
    costEur: all.reduce((sum, p) => sum + p.costEur, 0),
    topSpeedMps: motor.effects.topSpeedMps ?? 2,
    motorForceN: (motor.effects.torqueNm ?? 1) / WHEEL_RADIUS_M,
    motorPowerW: motor.powerW,
    basePowerW: locomotion.powerW + sensors.reduce((sum, p) => sum + p.powerW, 0),
    winchPowerW: winch?.powerW ?? 0,
    capacityWh: battery.effects.capacityWh ?? 0.5,
    grip: locomotion.effects.grip ?? {},
    sinkageFactor: locomotion.effects.sinkageFactor ?? 1,
    maxSlopeDeg: locomotion.effects.maxSlopeDeg ?? 20,
    roughGroundFactor: locomotion.effects.roughGroundFactor ?? 1,
    sensorRangeM,
    extras: extras.flatMap((p) => (p.effects.extra ? [p.effects.extra] : [])),
    impactDamageFactor: extras.reduce((factor, p) => factor * (p.effects.impactDamageFactor ?? 1), 1),
    waterproof: extras.some((p) => p.effects.waterproof === true),
    locomotionName: locomotion.name,
  };
}
