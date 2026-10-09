import type {
  Brain,
  BrainDecision,
  BrainQuestion,
  Build,
  DamageCause,
  DecisionRecord,
  DecisionTrigger,
  Episode,
  Mission,
  Policy,
  RunEvent,
  SimState,
} from '@rivetrun/contracts';
import { BRIEFING_MAX_CHARS } from '@rivetrun/contracts';
import { heuristicDecide } from './brains';
import { TUNING } from './data';
import { buildQuestion, detectDecisionPoint } from './perception';
import { createRun, markDecision, step, withAction } from './physics';
import { score } from './score';
import type { HeadlessOptions, HeadlessResult, RunConfig, RunController, RunControllerOptions, RunState } from './types';

// The package compiles without DOM or Node libs; these exist in every runtime we target.
declare const performance: { now(): number } | undefined;
declare function setTimeout(handler: () => void, ms: number): number;
declare function clearTimeout(handle: number): void;

const MAX_DECISIONS = 2000;
const TICK_MS = 16;
const MAX_FRAME_MS = 100;
/** Continuous damage (water, tip-over) is reported in chunks of this size. */
const DAMAGE_EVENT_PCT = 1;

function record(question: BrainQuestion, decision: BrainDecision): DecisionRecord {
  return {
    t: question.t,
    perceived: question.perceived,
    options: question.options,
    probabilities: decision.probabilities,
    selected: decision.selected,
    policy: decision.policy,
    fallback: decision.fallback,
    latencyMs: decision.latencyMs,
    trigger: question.trigger,
    ...(decision.model ? { model: decision.model } : {}),
  };
}

function episodePolicy(decisions: readonly DecisionRecord[], explicit?: Policy): Policy {
  if (explicit) return explicit;
  if (decisions.some((d) => d.policy === 'jev' || d.fallback)) return 'jev';
  return decisions[0]?.policy ?? 'heuristic';
}

function toEpisode(state: RunState, decisions: readonly DecisionRecord[], policy: Policy, id: string): Episode {
  return {
    id,
    missionId: state.config.mission.id,
    seed: state.config.seed,
    policy,
    build: state.config.build,
    environment: state.environment,
    priority: state.config.priority,
    decisions: decisions.slice(0, MAX_DECISIONS),
    outcome: score(state),
  };
}

/** The Brain's answer, or the heuristic's with fallback: true when it fails or picks an unavailable action. */
async function decideSafe(brain: Brain, question: BrainQuestion): Promise<BrainDecision> {
  try {
    const decision = await brain.decide(question);
    if (question.options.includes(decision.selected)) return decision;
  } catch {
    // Reported through fallback: true on the decision, which the HUD shows.
  }
  return { ...heuristicDecide(question), fallback: true };
}

/** No timers: runs to finish/DNF as fast as possible. Ghost frames at TUNING.ghostHz. */
export async function runHeadless(
  mission: Mission,
  seed: number,
  build: Build,
  brain: Brain,
  options: HeadlessOptions = {},
): Promise<HeadlessResult> {
  let state = createRun({ mission, seed, build, priority: options.priority ?? 0.5 });
  const decisions: DecisionRecord[] = [];
  const frames: SimState[] = [state.sim];
  const frameEvery = Math.max(1, Math.round(1000 / TUNING.ghostHz / TUNING.dtMs));
  let trigger: DecisionTrigger | null = 'start';
  while (!state.done) {
    if (trigger) {
      const question = buildQuestion(state, trigger);
      const decision = await decideSafe(brain, question);
      decisions.push(record(question, decision));
      state = withAction(markDecision(state), decision.selected);
    }
    const prev = state;
    state = step(state, state.action);
    trigger = detectDecisionPoint(prev, state);
    if (state.stepCount % frameEvery === 0 || state.done) frames.push(state.sim);
  }
  const policy = episodePolicy(decisions, options.policy);
  const episode = toEpisode(state, decisions, policy, `${mission.id}-${state.config.seed}-${policy}-headless`);
  return { episode, ghost: { policy, frames, outcome: episode.outcome } };
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function newEpisodeId(state: RunState): string {
  const random = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${state.config.mission.id}-${state.config.seed}-${Date.now().toString(36)}-${random}`;
}

/** Async loop: step → decision point → await brain.decide → apply. Emits RunEvents. Browser-safe. */
export function runController(config: RunConfig, brain: Brain, options: RunControllerOptions): RunController {
  const emit = (event: RunEvent): void => options.onEvent(event);
  const timeScale = options.timeScale ?? 1;
  const briefing = options.briefing?.trim().slice(0, BRIEFING_MAX_CHARS) || undefined;
  let stopped = false;
  let pending = false;
  let timer: number | undefined;
  let started: Promise<Episode> | undefined;
  let finish: (() => void) | undefined;

  const run = (): Promise<Episode> =>
    new Promise<Episode>((resolve) => {
      let state = createRun(config);
      const decisions: DecisionRecord[] = [];
      const pendingDamage: Partial<Record<DamageCause, number>> = {};
      let accumulatedMs = 0;
      let last = now();

      const complete = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        resolve(toEpisode(state, decisions, episodePolicy(decisions, options.policy), newEpisodeId(state)));
      };
      finish = complete;

      const ask = (trigger: DecisionTrigger): void => {
        pending = true;
        const question = buildQuestion(state, trigger, briefing);
        state = markDecision(state);
        emit({ type: 'decisionPending', t: question.t, question });
        void decideSafe(brain, question).then((decision) => {
          if (stopped) return;
          decisions.push(record(question, decision));
          state = withAction(state, decision.selected);
          pending = false;
          emit({ type: 'decision', t: state.sim.t, question, decision });
        });
      };

      const emitStep = (prev: RunState): void => {
        emit({ type: 'frame', state: state.sim });
        if (state.segmentIndex !== prev.segmentIndex) {
          emit({ type: 'terrainEnter', t: state.sim.t, terrain: state.sim.terrain, segmentIndex: state.segmentIndex });
        }
        const damage = state.lastDamage;
        if (damage) {
          const total = (pendingDamage[damage.cause] ?? 0) + damage.amountPct;
          if (damage.cause === 'impact' || total >= DAMAGE_EVENT_PCT || state.done) {
            emit({ type: 'damage', t: state.sim.t, cause: damage.cause, amountPct: total, totalPct: Math.min(100, state.sim.damage) });
            pendingDamage[damage.cause] = 0;
          } else {
            pendingDamage[damage.cause] = total;
          }
        }
      };

      const tick = (): void => {
        if (stopped) return;
        const current = now();
        const elapsed = Math.min(current - last, MAX_FRAME_MS);
        last = current;
        accumulatedMs += elapsed * timeScale * (pending ? TUNING.decision.slowMoFactor : 1);
        while (accumulatedMs >= TUNING.dtMs && !state.done) {
          accumulatedMs -= TUNING.dtMs;
          const prev = state;
          state = step(state, state.action);
          emitStep(prev);
          if (pending || state.done) continue;
          const trigger = detectDecisionPoint(prev, state);
          if (trigger) {
            ask(trigger);
            accumulatedMs *= TUNING.decision.slowMoFactor;
          }
        }
        if (state.done) {
          const outcome = score(state);
          emit(
            state.finished
              ? { type: 'finish', t: state.sim.t, outcome }
              : { type: 'dnf', t: state.sim.t, reason: state.dnfReason ?? 'timeout', outcome },
          );
          complete();
          return;
        }
        timer = setTimeout(tick, TICK_MS);
      };

      emit({ type: 'frame', state: state.sim });
      ask('start');
      timer = setTimeout(tick, TICK_MS);
    });

  return {
    start: () => {
      started ??= run();
      return started;
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      pending = false;
      finish?.();
    },
    isDecisionPending: () => pending,
  };
}
