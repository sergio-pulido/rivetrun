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
}

/** Damage applied by the last step, if any. */
export interface StepDamage {
  readonly cause: DamageCause;
  readonly amountPct: number;
  readonly obstacle?: Obstacle;
  readonly speedMps?: number;
}

/** Ground-truth tallies the "why" line is derived from. */
export interface RunStats {
  readonly slipSByTerrain: Partial<Record<TerrainId, number>>;
  readonly damageByCause: Partial<Record<DamageCause, number>>;
  readonly worstImpact?: { readonly obstacle: Obstacle; readonly speedMps: number; readonly amountPct: number };
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
}

export interface RunControllerOptions {
  /** Called for every event, in order. */
  readonly onEvent: (event: RunEvent) => void;
  /** Episode policy label. Default: 'jev' if any decision came from Jev or a fallback, else the first decision's policy. */
  readonly policy?: Policy;
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
