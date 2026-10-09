import type {
  Action,
  Brain,
  Build,
  DamageCause,
  DnfReason,
  Environment,
  Episode,
  GhostTrace,
  Mission,
  Obstacle,
  Policy,
  RunEvent,
  SimState,
  TerrainId,
} from '@rivetrun/contracts';
import type { RobotSpec } from './spec';
import type { World } from './world';

export interface RunConfig {
  readonly mission: Mission;
  readonly seed: number;
  readonly build: Build;
  /** 0 = speed, 1 = safety. */
  readonly priority: number;
  /** True when a player drives: `jump` fires at once instead of timing itself to the next gap. */
  readonly manual?: boolean;
}

/** What happened in the air during the last step, if anything. */
export type AirEvent =
  | { readonly type: 'airborne'; readonly cause: 'ramp' | 'jump' | 'drop' }
  | { readonly type: 'landed'; readonly impactMps: number; readonly airtimeS: number; readonly damagePct: number }
  | { readonly type: 'fell'; readonly falls: number; readonly respawnX: number; readonly fromX: number };

/** Damage applied by the last step, if any. */
export interface StepDamage {
  readonly cause: DamageCause;
  readonly amountPct: number;
  readonly obstacle?: Obstacle;
  /** Set when the impact was driving onto rough ground too fast. */
  readonly roughEntry?: TerrainId;
  readonly speedMps?: number;
  /** Set for a hard landing or a fall into a gap. */
  readonly air?: 'landing' | 'fall';
}

/** Ground-truth tallies the "why" line is derived from. */
export interface RunStats {
  readonly slipSByTerrain: Partial<Record<TerrainId, number>>;
  readonly damageByCause: Partial<Record<DamageCause, number>>;
  readonly worstImpact?: { readonly obstacle?: Obstacle; readonly roughEntry?: TerrainId; readonly air?: 'landing' | 'fall'; readonly speedMps: number; readonly amountPct: number };
  readonly lastTerrain: TerrainId;
}

/**
 * Full internal sim state (ground truth). Never leaves the sim; the renderer
 * reads `sim` and the Brain reads `perceive(state)`.
 */
export interface RunState {
  readonly config: RunConfig;
  readonly environment: Environment;
  readonly sim: SimState;
  readonly action: Action;
  readonly segmentIndex: number;
  readonly rngState: number;
  readonly done: boolean;
  readonly world: World;
  readonly spec: RobotSpec;
  /** Fixed steps taken; sim.t = stepCount × dt. */
  readonly stepCount: number;
  /** True slip, 0–100 %. The Brain only gets it through the IMU. */
  readonly slipPct: number;
  readonly lastDecisionT: number;
  readonly bestX: number;
  readonly lastProgressT: number;
  readonly sparksUntilT: number;
  /** Seconds spent driving without moving: the robot can feel this without any sensor. */
  readonly stallS: number;
  /** Height above the base track line while airborne, metres. */
  readonly heightM: number;
  readonly vy: number;
  readonly airborne: boolean;
  readonly airStartT: number;
  readonly falls: number;
  /** Sim time at which the piston can fire again. */
  readonly jumpReadyT: number;
  readonly lastAir?: AirEvent;
  readonly finished: boolean;
  readonly dnfReason?: DnfReason;
  readonly lastDamage?: StepDamage;
  readonly stats: RunStats;
}

export interface HeadlessResult {
  readonly episode: Episode;
  readonly ghost: GhostTrace;
}

export interface HeadlessOptions {
  /** 0 = speed, 1 = safety. Default 0.5. */
  readonly priority?: number;
  /** Episode / ghost policy label. Default: the policy of the first decision. */
  readonly policy?: Policy;
  /** The player's instructions to the Brain; put on every BrainQuestion. Only Jev reads it. */
  readonly briefing?: string;
}

export interface RunControllerOptions {
  /** Called for every event, in order. */
  readonly onEvent: (event: RunEvent) => void;
  /** Episode policy label. Default: 'jev' if any decision came from Jev or a fallback, else the first decision's policy. */
  readonly policy?: Policy;
  /** The player's instructions to the Brain; put on every BrainQuestion. Only Jev reads it. */
  readonly briefing?: string;
  /** false = the run never slows down while the Brain decides (a live ghost). Default true. */
  readonly slowMo?: boolean;
  /** Sim seconds per real second when no decision is pending. Default 1. */
  readonly timeScale?: number;
}

export interface RunController {
  /** Resolves with the recorded Episode when the run finishes or DNFs (or is stopped). */
  start(): Promise<Episode>;
  stop(): void;
  /** True while the run is slowed down waiting for the Brain. */
  isDecisionPending(): boolean;
}

export type { Brain };
