import type { Part, PartId, Preset, PresetId } from '@rivetrun/contracts';

// v0 values. Tuned later by scripts/balance.ts.
// The spec lists 14 parts (3 locomotion, 2 motors, 2 batteries, 4 sensors, 3 extras).
export const PARTS: readonly Part[] = [
  // Locomotion (exactly 1)
  {
    id: 'wheels', name: 'Wheels', slot: 'locomotion', blurb: 'Light and fast on hard ground.',
    massKg: 0.4, costEur: 20, powerW: 0, unlockPoints: 0,
    effects: { grip: { asphalt: 1.1, ice: 0.6, mud: 0.7, sand: 0.8 }, sinkageFactor: 1.2, maxSlopeDeg: 18, maxWadingDepthCm: 20 },
  },
  {
    id: 'offroad_wheels', name: 'Off-road wheels', slot: 'locomotion', blurb: 'Knobbly tyres: grip on loose ground.',
    massKg: 0.7, costEur: 45, powerW: 0, unlockPoints: 0,
    effects: { grip: { grass: 1.2, sand: 1.2, mud: 1.1, rock: 1.2, ice: 0.8 }, sinkageFactor: 0.9, maxSlopeDeg: 24, maxWadingDepthCm: 35, clearanceFactor: 1.25 },
  },
  {
    id: 'tracks', name: 'Tracks', slot: 'locomotion', blurb: 'Slow, heavy, almost never slips or sinks.',
    massKg: 1.3, costEur: 80, powerW: 2, unlockPoints: 0,
    effects: { grip: { asphalt: 0.9, sand: 1.4, mud: 1.6, ice: 1.8, water: 1.2, rock: 1.1 }, sinkageFactor: 0.4, maxSlopeDeg: 32, roughGroundFactor: 0.35, maxWadingDepthCm: 45, clearanceFactor: 1.5 },
  },
  // Motor (exactly 1)
  {
    id: 'motor_light', name: 'Light motor', slot: 'motor', blurb: 'Fast, low torque.',
    massKg: 0.3, costEur: 25, powerW: 18, unlockPoints: 0,
    effects: { topSpeedMps: 3, torqueNm: 0.8 },
  },
  {
    id: 'motor_torque', name: 'High-torque motor', slot: 'motor', blurb: 'Slower, strong, thirsty.',
    massKg: 0.6, costEur: 50, powerW: 30, unlockPoints: 0,
    effects: { topSpeedMps: 2, torqueNm: 2 },
  },
  {
    // DFRobot FIT0441: 12 V brushless gearmotor, about 159 rpm at the shaft, 2.4 kg·cm stall, driver and encoder built in.
    // Game speed and torque sit between the two brushed motors, as its spec does; mass is a game value (the BOM lists none).
    id: 'brushless_motor_dfrobot_fit0441', name: 'Brushless motor', slot: 'motor', blurb: 'Brushless with its driver built in: quicker than the torque motor, stronger than the light one.',
    massKg: 0.45, costEur: 40, powerW: 24, unlockPoints: 250,
    effects: { topSpeedMps: 2.5, torqueNm: 1.4 },
  },
  // Battery (exactly 1)
  {
    id: 'battery_small', name: 'Small battery', slot: 'battery', blurb: 'Light. A quarter of the large pack: pace yourself.',
    massKg: 0.3, costEur: 20, powerW: 0, unlockPoints: 0,
    effects: { capacityWh: 0.3 },
  },
  {
    id: 'battery_large', name: 'Large battery', slot: 'battery', blurb: 'Heavy. Goes the distance.',
    massKg: 0.9, costEur: 45, powerW: 0, unlockPoints: 0,
    effects: { capacityWh: 1.2 },
  },
  // Sensors (0–2)
  {
    id: 'ultrasonic', name: 'Ultrasonic', slot: 'sensor', blurb: 'Sees obstacles up to 3 m ahead.',
    massKg: 0.05, costEur: 10, powerW: 0.5, unlockPoints: 0,
    effects: { sensor: 'ultrasonic', rangeM: 3 },
  },
  {
    id: 'imu', name: 'IMU', slot: 'sensor', blurb: 'Feels slip and tilt.',
    massKg: 0.02, costEur: 15, powerW: 0.2, unlockPoints: 0,
    effects: { sensor: 'imu' },
  },
  {
    id: 'camera', name: 'Camera', slot: 'sensor', blurb: 'Reads the next terrain up to 6 m ahead.',
    massKg: 0.1, costEur: 35, powerW: 2, unlockPoints: 0,
    effects: { sensor: 'camera', rangeM: 6 },
  },
  {
    id: 'moisture_probe', name: 'Moisture probe', slot: 'sensor', blurb: 'Measures water and mud depth ahead.',
    massKg: 0.05, costEur: 15, powerW: 0.3, unlockPoints: 150,
    effects: { sensor: 'moisture', rangeM: 3 },
  },
  {
    id: 'scout_drone', name: 'Scout drone', slot: 'sensor', blurb: 'Flies ahead: reads the next terrain change up to 15 m out.',
    massKg: 0.09, costEur: 60, powerW: 6, unlockPoints: 0,
    effects: { sensor: 'scout_drone', rangeM: 15 },
  },
  {
    // Slamtec RPLIDAR C1: 12 m range, 110 g (docs/inputs/bom-mk2.json). Same obstacle-ranging mechanic as the ultrasonic.
    id: 'lidar_rplidar_c1', name: 'RPLIDAR C1', slot: 'sensor', blurb: 'Spinning lidar: sees obstacles and gaps 12 m ahead, so the driver can plan the approach.',
    massKg: 0.11, costEur: 70, powerW: 2.5, unlockPoints: 400,
    effects: { sensor: 'ultrasonic', rangeM: 12, source: 'lidar' },
  },
  {
    // Pololu #3415 VL53L1X time-of-flight carrier: 4 m range, 0.5 g (docs/inputs/bom-mk2.json).
    id: 'tof_vl53l1x_pololu', name: 'ToF ranger', slot: 'sensor', blurb: 'Laser time-of-flight: sees obstacles 4 m ahead and weighs half a gram.',
    massKg: 0.0005, costEur: 22, powerW: 0.1, unlockPoints: 100,
    effects: { sensor: 'ultrasonic', rangeM: 4, source: 'tof' },
  },
  // Extras (0–2)
  {
    id: 'winch', name: 'Winch', slot: 'extra', blurb: 'Hauls the robot over slopes and obstacles.',
    massKg: 0.5, costEur: 40, powerW: 12, unlockPoints: 300,
    effects: { extra: 'winch' },
  },
  {
    id: 'waterproof_case', name: 'Waterproof case', slot: 'extra', blurb: 'No water damage. Adds mass.',
    massKg: 0.4, costEur: 30, powerW: 0, unlockPoints: 0,
    effects: { extra: 'waterproof_case', waterproof: true },
  },
  {
    id: 'bumper', name: 'Bumper', slot: 'extra', blurb: 'Halves impact damage. Adds mass.',
    massKg: 0.3, costEur: 20, powerW: 0, unlockPoints: 0,
    effects: { extra: 'bumper', impactDamageFactor: 0.5 },
  },
  {
    id: 'thruster_kit', name: 'Thruster kit', slot: 'extra', blurb: 'Twin thrusters: a sealed robot cruises under water up to 120 cm deep. Needs the waterproof case.',
    massKg: 0.12, costEur: 45, powerW: 8, unlockPoints: 0,
    effects: { extra: 'thruster_kit', requiresExtra: 'waterproof_case', maxSwimDepthCm: 120 },
  },
  {
    id: 'piston_jump', name: 'Piston jump', slot: 'extra', blurb: 'A spring-loaded piston kicks the robot into the air. 3 s to re-arm.',
    massKg: 0.25, costEur: 35, powerW: 15, unlockPoints: 0,
    effects: { extra: 'piston_jump', jumpImpulseMps: 4, cooldownS: 3 },
  },
];

export const PARTS_BY_ID: ReadonlyMap<PartId, Part> = new Map(PARTS.map((part) => [part.id, part]));

/** One-tap builds. They use only parts that are unlocked from the start. */
export const PRESETS: Readonly<Record<PresetId, Preset>> = {
  speedster: {
    id: 'speedster', name: 'Speedster', blurb: 'Light and quick. Hates mud and water.',
    build: { locomotion: 'wheels', motor: 'motor_light', battery: 'battery_small', sensors: ['camera', 'ultrasonic'], extras: [] },
  },
  mud_crawler: {
    id: 'mud_crawler', name: 'Mud Crawler', blurb: 'Tracks, torque and a sealed case.',
    build: { locomotion: 'tracks', motor: 'motor_torque', battery: 'battery_large', sensors: ['imu'], extras: ['waterproof_case'] },
  },
  all_rounder: {
    id: 'all_rounder', name: 'All-rounder', blurb: 'Sees ahead, takes a knock. The default.',
    build: { locomotion: 'offroad_wheels', motor: 'motor_torque', battery: 'battery_large', sensors: ['camera', 'ultrasonic'], extras: ['bumper'] },
  },
  deep_diver: {
    id: 'deep_diver', name: 'Deep Diver', blurb: 'Sealed hull and thrusters. The one that crosses Deep Water.',
    build: { locomotion: 'wheels', motor: 'motor_torque', battery: 'battery_large', sensors: ['ultrasonic', 'camera'], extras: ['waterproof_case', 'thruster_kit'] },
  },
};

export const DEFAULT_PRESET_ID: PresetId = 'all_rounder';
