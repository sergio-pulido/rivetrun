import type { Part, PartId } from '@rivetrun/contracts';
import { TERRAINS } from '@rivetrun/sim';

export interface PartInfo {
  /** Full name on the part sheet. */
  readonly title: string;
  /** The class of real hardware the part stands for. */
  readonly klass: string;
  /** What the real thing is and where it comes from. */
  readonly real: string;
  /** What it plugs into or ships with. */
  readonly platforms: readonly string[];
  /** Search terms for "Find it in shops". */
  readonly shopQuery: string;
}

const INFO: Readonly<Record<string, PartInfo>> = {
  wheels: {
    title: 'Street wheels', klass: '65 mm TT wheels',
    real: 'Rubber-tyred plastic wheels that press onto TT gear-motor shafts. Almost every two-wheel-drive robot car kit includes a pair.',
    platforms: ['TT motor shaft', 'Robot car kits'], shopQuery: '65mm robot car wheel TT motor',
  },
  offroad_wheels: {
    title: 'Off-road wheels', klass: '85 mm knobbly tyres',
    real: 'Wide knobbly tyres on a hex hub, sold for RC cars and rover kits.',
    platforms: ['12 mm hex hub', 'Rover kits'], shopQuery: '85mm off-road robot wheel 12mm hex',
  },
  tracks: {
    title: 'Tracks', klass: 'tank chassis kit',
    real: 'Rubber or linked-plastic tracks on drive sprockets, sold as tank chassis kits for hobby robots.',
    platforms: ['Tank chassis kits', 'DC gearmotors'], shopQuery: 'robot tank chassis tracks kit',
  },
  motor_light: {
    title: 'Light motor', klass: 'TT gear-motor-class',
    real: 'The yellow plastic geared DC motor from starter robot kits: cheap, quick and not very strong.',
    platforms: ['L298N driver', 'TB6612 driver'], shopQuery: 'TT gear motor 3-6V',
  },
  motor_torque: {
    title: 'High-torque motor', klass: 'metal gearmotor-class',
    real: 'A DC motor behind a metal gearbox. A high reduction trades speed for pulling power.',
    platforms: ['TB6612 driver', 'DRV8833 driver'], shopQuery: 'metal gearmotor 12V robot',
  },
  battery_small: {
    title: 'Small battery', klass: 'single-cell pack-class',
    real: 'A small rechargeable lithium pack: light on the chassis, empty sooner.',
    platforms: ['JST connector', 'USB charger board'], shopQuery: 'LiPo battery JST robot',
  },
  battery_large: {
    title: 'Large battery', klass: '2-cell 18650-class',
    real: 'Two lithium cells in a holder. More than double the energy, and you carry the weight everywhere.',
    platforms: ['18650 holder', 'Balance charger'], shopQuery: '2S 18650 battery holder',
  },
  ultrasonic: {
    title: 'Ultrasonic rangefinder', klass: 'HC-SR04-class',
    real: 'The same module ships in most Arduino starter kits and sells on its own at electronics and maker shops.',
    platforms: ['Arduino', 'Raspberry Pi', 'ESP32'], shopQuery: 'HC-SR04 ultrasonic sensor',
  },
  imu: {
    title: 'IMU', klass: 'MPU-6050-class',
    real: 'A six-axis accelerometer and gyroscope on a breakout board, read over I2C.',
    platforms: ['Arduino', 'Raspberry Pi', 'ESP32'], shopQuery: 'MPU-6050 breakout board',
  },
  camera: {
    title: 'Camera', klass: 'Pi-camera-class',
    real: 'A small camera module on a ribbon cable. Boards like the ESP32-CAM bundle one with a microcontroller.',
    platforms: ['Raspberry Pi', 'ESP32-CAM'], shopQuery: 'Raspberry Pi camera module',
  },
  moisture_probe: {
    title: 'Moisture probe', klass: 'capacitive probe-class',
    real: 'A capacitive soil-moisture probe: an analog pin reads how wet whatever it touches is.',
    platforms: ['Arduino', 'ESP32'], shopQuery: 'capacitive soil moisture sensor',
  },
  scout_drone: {
    title: 'Scout drone', klass: 'micro quadcopter',
    real: 'Palm-sized programmable quadcopters are sold for classrooms and hobbyists. Flying one ahead of a rover is the stretch this game makes.',
    platforms: ['Programmable mini drones'], shopQuery: 'programmable mini drone',
  },
  winch: {
    title: 'Winch', klass: 'servo winch-class',
    real: 'A continuous-rotation servo or small gearmotor with a spool and cord, as fitted to RC crawlers.',
    platforms: ['Continuous servo', 'RC crawler winch'], shopQuery: 'RC crawler servo winch',
  },
  waterproof_case: {
    title: 'Waterproof case', klass: 'IP65 project box',
    real: 'A sealed ABS enclosure with a gasket and cable glands, the kind used for outdoor electronics.',
    platforms: ['IP65 enclosure', 'Cable glands'], shopQuery: 'IP65 waterproof project box',
  },
  bumper: {
    title: 'Bumper', klass: 'printed TPU',
    real: 'A flexible 3D-printed bumper bolted to the front of the chassis.',
    platforms: ['TPU filament', '3D printer'], shopQuery: 'TPU filament 1.75mm',
  },
};

export const partInfo = (part: Part): PartInfo =>
  INFO[part.id] ?? { title: part.name, klass: part.slot, real: part.blurb, platforms: [], shopQuery: part.name };

export const shopUrl = (part: Part): string => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(partInfo(part).shopQuery)}`;

export interface BrainRow {
  /** "with it" / "without", or a property name for parts every robot has one of. */
  readonly side: string;
  readonly field: string;
  /** null = the brain gets "?" for this field. */
  readonly value: string | null;
}

export interface BrainGets {
  readonly heading: string;
  readonly rows: readonly BrainRow[];
  readonly note: string;
}

const pair = (field: string, example: string): readonly BrainRow[] => [
  { side: 'with it', field, value: example },
  { side: 'without', field, value: null },
];

const LOOKAHEAD_NOTE = 'Jev never drives the body directly. Every option is simulated on this exact robot first, so these numbers shape each choice.';

/** What a part changes in the question the brain is asked. Sensor readings shown are examples of the field, not measurements. */
export function brainGets(part: Part): BrainGets {
  const { effects } = part;
  const heading = 'What your brain gets';
  switch (effects.sensor) {
    case 'ultrasonic':
      return { heading, rows: pair('obstacleAheadM', '2.4'), note: 'Without it, Jev learns about the rock when it hits it.' };
    case 'imu':
      return { heading, rows: [...pair('slipPct', '31'), ...pair('tiltDeg', '14.8')], note: 'Without it, Jev cannot tell spinning wheels from progress.' };
    case 'camera':
      return { heading, rows: [...pair('terrainAhead', 'mud'), ...pair('terrainAheadDistanceM', '4.2')], note: 'Without it, Jev learns each terrain only when the robot is already on it.' };
    case 'scout_drone':
      return { heading, rows: [...pair('terrainAhead', 'ice'), ...pair('terrainAheadDistanceM', '13.5')], note: `The same fields as the camera, from ${effects.rangeM} m out. The drone wins when both are fitted.` };
    case 'moisture':
      return { heading, rows: pair('depthAheadCm', '8'), note: 'Without it, the depth of the water or mud ahead is a guess.' };
    default:
      break;
  }
  if (effects.extra === 'winch') {
    return { heading, rows: [{ side: 'with it', field: 'options', value: '+ deploy_winch' }, { side: 'without', field: 'options', value: null }], note: 'A seventh action: without the winch it is never offered to the brain.' };
  }
  if (effects.waterproof) {
    return {
      heading: 'What it changes', note: 'The brain can cross water at any speed without watching the damage figure climb.',
      rows: [{ side: 'with it', field: 'water damage', value: '0' }, { side: 'without', field: 'water damage', value: `${TERRAINS.water.waterDamage} %/s per 10 cm` }],
    };
  }
  if (effects.impactDamageFactor !== undefined) {
    return {
      heading: 'What it changes', note: 'A hit that would cost 10 % costs half. Risky options look better in the lookahead.',
      rows: [{ side: 'with it', field: 'impact damage', value: `×${effects.impactDamageFactor}` }, { side: 'without', field: 'impact damage', value: '×1' }],
    };
  }
  if (part.slot === 'locomotion') {
    return {
      heading: 'What your brain works with', note: LOOKAHEAD_NOTE,
      rows: [{ side: 'tips over past', field: 'slope', value: `${effects.maxSlopeDeg}°` }, { side: 'sinks in', field: 'sinkage', value: `×${effects.sinkageFactor}` }],
    };
  }
  if (part.slot === 'motor') {
    return {
      heading: 'What your brain works with', note: LOOKAHEAD_NOTE,
      rows: [{ side: 'flat out', field: 'top speed', value: `${effects.topSpeedMps} m/s` }, { side: 'pulls with', field: 'torque', value: `${effects.torqueNm} N·m` }],
    };
  }
  return { heading: 'What your brain works with', note: LOOKAHEAD_NOTE, rows: [{ side: 'carries', field: 'capacity', value: `${effects.capacityWh} Wh` }] };
}

export interface SpecTile {
  readonly label: string;
  readonly value: string;
}

const massText = (kg: number): string => (kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg} kg`);

/** Four spec tiles: the number that defines the part, then mass, power and cost, straight from the sim's data. */
export function specTiles(part: Part): readonly SpecTile[] {
  const { effects } = part;
  const lead: SpecTile =
    part.slot === 'sensor' ? { label: 'RANGE', value: effects.rangeM ? `${effects.rangeM} m` : 'body' }
    : part.slot === 'locomotion' ? { label: 'SLOPE', value: `≤ ${effects.maxSlopeDeg}°` }
    : part.slot === 'motor' ? { label: 'SPEED', value: `${effects.topSpeedMps} m/s` }
    : part.slot === 'battery' ? { label: 'ENERGY', value: `${effects.capacityWh} Wh` }
    : effects.extra === 'winch' ? { label: 'ACTIONS', value: '+1' }
    : effects.waterproof ? { label: 'WATER', value: '×0' }
    : { label: 'IMPACT', value: `×${effects.impactDamageFactor ?? 1}` };
  return [lead, { label: 'MASS', value: massText(part.massKg) }, { label: 'POWER', value: `${part.powerW} W` }, { label: 'COST', value: `€${part.costEur}` }];
}

/** One line for a part card: what it does, in the fewest words. */
export function effectLine(part: Part): string {
  const { effects } = part;
  if (effects.sensor === 'ultrasonic') return `Sees obstacles ≤ ${effects.rangeM} m`;
  if (effects.sensor === 'camera') return `Reads terrain ≤ ${effects.rangeM} m`;
  if (effects.sensor === 'scout_drone') return `Scouts ${effects.rangeM} m ahead`;
  if (effects.sensor === 'imu') return 'Feels slip and tilt';
  if (effects.sensor === 'moisture') return 'Measures water depth';
  if (effects.extra === 'winch') return 'Adds deploy_winch';
  if (effects.waterproof) return 'No water damage';
  if (effects.impactDamageFactor !== undefined) return `Impact damage ×${effects.impactDamageFactor}`;
  if (part.slot === 'locomotion') return `Slopes ≤ ${effects.maxSlopeDeg}°`;
  if (part.slot === 'motor') return `${effects.topSpeedMps} m/s · ${effects.torqueNm} N·m`;
  return `${effects.capacityWh} Wh`;
}

export const isKnownPart = (id: PartId): boolean => id in INFO;
