// "What your robot can sense": the brain (Jev, the built-in driver, the HUD hints) knows only what the build's
// sensors report, plus the core kit. Wording follows docs/BRAIN_V3_SENSING.md; ranges come from the sim.
import type { Build, Part } from '@rivetrun/contracts';
import * as sim from '@rivetrun/sim';
import { PARTS, PARTS_BY_ID } from '@rivetrun/sim';
import { capabilities } from '@/ui/strategy/sim';

export type SenseId = 'obstacles' | 'terrain' | 'depth' | 'body' | 'contact';

export interface SenseRow {
  readonly id: SenseId | string;
  readonly text: string;
  /** The fitted part that provides it. */
  readonly source: string | null;
  /** For a sense the build lacks: the parts that would provide it. */
  readonly fit: string | null;
}

export interface Sensing {
  /** What every build knows, sensors or not. The core kit includes power sensing. */
  readonly core: readonly string[];
  readonly can: readonly SenseRow[];
  readonly cannot: readonly SenseRow[];
}

/** Game assumption, stated to the player: every build measures its own power. */
const CORE: readonly string[] = ['Wheel speed and distance', 'Battery charge and current draw', 'Projected charge at the finish', 'Mission plan'];

type SensorKind = NonNullable<Part['effects']['sensor']>;

const KINDS: Readonly<Record<Exclude<SenseId, 'contact'>, readonly SensorKind[]>> = {
  obstacles: ['ultrasonic'],
  terrain: ['camera', 'scout_drone'],
  depth: ['moisture'],
  body: ['imu'],
};

const playable = (part: Part): boolean => !part.comingSoon;
const partsOfKind = (kinds: readonly SensorKind[]): readonly Part[] => PARTS.filter((part) => playable(part) && part.effects.sensor !== undefined && kinds.includes(part.effects.sensor));
const anyOf = (names: readonly string[]): string => (names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : (names[0] ?? ''));

/**
 * The sim's own statement of what a build senses (Brain v3), once it exports one: the same wording as the run HUD and the
 * question Jev is asked. Looked up at call time, and ignored unless it has the shape the sim session posted.
 */
function simSenses(build: Build): Pick<Sensing, 'can' | 'cannot'> | null {
  const senses = (sim as unknown as { readonly senses?: (build: Build) => unknown }).senses;
  if (typeof senses !== 'function') return null;
  try {
    const said = senses(build) as { readonly can?: unknown; readonly cannot?: unknown } | null;
    const lines = (value: unknown): readonly string[] | null => (Array.isArray(value) && value.every((line) => typeof line === 'string') ? value : null);
    const [can, cannot] = [lines(said?.can), lines(said?.cannot)];
    if (!can || !cannot) return null;
    const rows = (texts: readonly string[]): readonly SenseRow[] => texts.map((text) => ({ id: text, text, source: null, fit: null }));
    return { can: rows(can), cannot: rows(cannot) };
  } catch {
    return null;
  }
}

/** What this build's brain can know and what it cannot. */
export function sensing(build: Build): Sensing {
  const said = simSenses(build);
  if (said) return { core: CORE, ...said };
  const caps = capabilities(build);
  const fitted = [...build.sensors, ...build.extras].flatMap((id) => PARTS_BY_ID.get(id) ?? []);
  // Of two fitted parts that give the same sense, the longer range is the one that counts.
  const source = (kinds: readonly SensorKind[]): string | null =>
    [...fitted].filter((part) => part.effects.sensor !== undefined && kinds.includes(part.effects.sensor)).sort((a, b) => (b.effects.rangeM ?? 0) - (a.effects.rangeM ?? 0))[0]?.name ?? null;
  const bumper = fitted.find((part) => part.effects.impactDamageFactor !== undefined)?.name ?? null;
  const imu = source(KINDS.body);
  const contact = bumper ?? imu;
  const ahead = caps?.lookahead ?? { obstacleM: 0, terrainM: 0, waterDepthM: 0 };

  const rows: readonly { readonly row: SenseRow; readonly on: boolean }[] = [
    {
      on: ahead.obstacleM > 0,
      row: ahead.obstacleM > 0
        ? { id: 'obstacles', text: `Obstacles and gap edges, ${ahead.obstacleM} m ahead`, source: source(KINDS.obstacles), fit: null }
        : { id: 'obstacles', text: `Obstacles and gaps ahead: it finds them by hitting them${contact ? '' : ', or not at all'}`, source: null, fit: anyOf(partsOfKind(KINDS.obstacles).map((part) => part.name)) },
    },
    {
      on: ahead.terrainM > 0,
      row: ahead.terrainM > 0
        ? { id: 'terrain', text: `Terrain type, ${ahead.terrainM} m ahead`, source: source(KINDS.terrain), fit: null }
        : { id: 'terrain', text: 'Terrain type ahead: unknown until it is on it', source: null, fit: anyOf(partsOfKind(KINDS.terrain).map((part) => part.name)) },
    },
    {
      on: ahead.waterDepthM > 0,
      row: ahead.waterDepthM > 0
        ? { id: 'depth', text: `Water and mud depth, ${ahead.waterDepthM} m ahead`, source: source(KINDS.depth), fit: null }
        : { id: 'depth', text: 'Water and mud depth: unknown until it is in it', source: null, fit: anyOf(partsOfKind(KINDS.depth).map((part) => part.name)) },
    },
    {
      on: imu !== null,
      row: imu !== null
        ? { id: 'body', text: 'Tilt, slope angle and slip', source: imu, fit: null }
        : { id: 'body', text: 'Slip and slope: it cannot tell it is slipping or how steep it is', source: null, fit: anyOf(partsOfKind(KINDS.body).map((part) => part.name)) },
    },
    {
      on: contact !== null,
      row: contact !== null
        ? { id: 'contact', text: 'Contact, after it happens', source: contact, fit: null }
        : { id: 'contact', text: 'Contact: it does not feel a hit', source: null, fit: anyOf([...PARTS.filter((part) => playable(part) && part.effects.impactDamageFactor !== undefined), ...partsOfKind(KINDS.body)].map((part) => part.name)) },
    },
  ];
  return { core: CORE, can: rows.filter((entry) => entry.on).map((entry) => entry.row), cannot: rows.filter((entry) => !entry.on).map((entry) => entry.row) };
}
