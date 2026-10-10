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

/** What the trigger detector remembers between steps. Positions are identities, never shown to the brain. */
export interface BrainMemory {
  readonly hazardSeenX: number;
  readonly hazardReachedX: number;
  readonly gapSeenX: number;
  readonly gapReachedX: number;
  readonly terrainSeenX: number;
  readonly zonesSeen: readonly string[];
  readonly zonesReached: readonly string[];
  readonly slipping: boolean;
  /** 0 = under 10°, 1 = 10–20°, 2 = over 20°. */
  readonly tiltBand: number;
  readonly energyLow: boolean;
  /** 0 = moving; 1, 2, … = how many times the stall has been reported. */
  readonly stallMark: number;
  readonly stopTold: boolean;
  readonly jumpReady: boolean;
  readonly damageStep: number;
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
  /** The obstacle stopped the robot. */
  readonly blocked?: boolean;
}

/** Ground-truth tallies the "why" line is derived from. */
export interface RunStats {
  readonly slipSByTerrain: Partial<Record<TerrainId, number>>;
  readonly damageByCause: Partial<Record<DamageCause, number>>;
  readonly worstImpact?: { readonly obstacle?: Obstacle; readonly roughEntry?: TerrainId; readonly air?: 'landing' | 'fall'; readonly blocked?: boolean; readonly speedMps: number; readonly amountPct: number };
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
  /** The obstacle the robot is stopped against, if any. */
  readonly blockedBy?: Obstacle;
  /** Electrical draw in the last step, watts (core kit: current sensing). */
  readonly drawW: number;
  /** Seconds at rest under a command to stand still. */
  readonly stoppedS: number;
  /** The last obstacle touched. A brain learns of it only through a bumper or an IMU. */
  readonly lastContact?: { readonly atM: number; readonly t: number; readonly kind: Obstacle };
  /** Gameplay v3 scan zones: done, missed, and the hold on the one under the robot. */
  readonly scans: { readonly done: readonly string[]; readonly missed: readonly string[]; readonly holdS: number; readonly justDone?: string; readonly centred: number };
  /** Brain v3: what has already been announced, so each change asks for one decision. */
  readonly brain: BrainMemory;
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
  /** true = slow the run to 0.25× while the Brain decides (v2 behaviour). Default false: latency is real. */
  readonly slowMo?: boolean;
  /** Drive mode: false turns off the heuristic's advisory decision events. Default true. */
  readonly hints?: boolean;
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
