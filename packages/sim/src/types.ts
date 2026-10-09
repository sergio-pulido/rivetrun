import type {
  Action,
  Brain,
  Build,
  Environment,
  Episode,
  GhostTrace,
  Mission,
  RunEvent,
  SimState,
} from '@rivetrun/contracts';

export interface RunConfig {
  readonly mission: Mission;
  readonly seed: number;
  readonly build: Build;
  /** 0 = speed, 1 = safety. */
  readonly priority: number;
}

/**
 * Full internal sim state (ground truth). Never leaves the sim; the renderer
 * reads `sim` and the Brain reads `perceive(state)`.
 * Stub shape: the sim session extends it.
 */
export interface RunState {
  readonly config: RunConfig;
  readonly environment: Environment;
  readonly sim: SimState;
  readonly action: Action;
  readonly segmentIndex: number;
  readonly rngState: number;
  readonly done: boolean;
}

export interface HeadlessResult {
  readonly episode: Episode;
  readonly ghost: GhostTrace;
}

export interface RunControllerOptions {
  /** Called for every event, in order. */
  readonly onEvent: (event: RunEvent) => void;
}

export interface RunController {
  /** Resolves with the recorded Episode when the run finishes or DNFs. */
  start(): Promise<Episode>;
  stop(): void;
}

export type { Brain };
