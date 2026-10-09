import type { Part } from '@rivetrun/contracts';
import { TERRAINS } from '@rivetrun/sim';

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
  if (effects.maxSwimDepthCm !== undefined) {
    return {
      heading: 'What it changes', note: 'It only works on a sealed robot: fit the waterproof case with it.',
      rows: [{ side: 'with it', field: 'deep water', value: `cruises to ${effects.maxSwimDepthCm} cm` }, { side: 'without', field: 'deep water', value: 'sinks' }],
    };
  }
  if (part.slot === 'locomotion') {
    return {
      heading: 'What your brain works with', note: LOOKAHEAD_NOTE,
      rows: [
        { side: 'tips over past', field: 'slope', value: `${effects.maxSlopeDeg}°` },
        { side: 'sinks in', field: 'sinkage', value: `×${effects.sinkageFactor}` },
        ...(effects.maxWadingDepthCm === undefined ? [] : [{ side: 'wades through', field: 'water', value: `${effects.maxWadingDepthCm} cm` }]),
      ],
    };
  }
  if (part.slot === 'motor') {
    return {
      heading: 'What your brain works with', note: LOOKAHEAD_NOTE,
      rows: [{ side: 'flat out', field: 'top speed', value: `${effects.topSpeedMps} m/s` }, { side: 'pulls with', field: 'torque', value: `${effects.torqueNm} N·m` }],
    };
  }
  if (part.slot === 'battery') {
    return { heading: 'What your brain works with', note: LOOKAHEAD_NOTE, rows: [{ side: 'carries', field: 'capacity', value: `${effects.capacityWh} Wh` }] };
  }
  // A part this sheet has no specific wording for yet: say what the sim says about it.
  return { heading: 'What it changes', note: part.blurb, rows: [] };
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
    : effects.maxSwimDepthCm !== undefined ? { label: 'DEPTH', value: `${effects.maxSwimDepthCm} cm` }
    : effects.impactDamageFactor !== undefined ? { label: 'IMPACT', value: `×${effects.impactDamageFactor}` }
    : { label: 'SLOT', value: part.slot };
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
  if (effects.maxSwimDepthCm !== undefined) return `Swims to ${effects.maxSwimDepthCm} cm`;
  if (part.slot === 'locomotion') return `Slopes ≤ ${effects.maxSlopeDeg}°`;
  if (part.slot === 'motor') return `${effects.topSpeedMps} m/s · ${effects.torqueNm} N·m`;
  if (part.slot === 'battery') return `${effects.capacityWh} Wh`;
  return part.blurb;
}
