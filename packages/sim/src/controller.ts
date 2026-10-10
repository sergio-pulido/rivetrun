import type {
  Action,
  ControlInput,
  Brain,
  BrainDecision,
  BrainQuestion,
  Build,
  DamageCause,
  DecisionLog,
  DecisionRecord,
  Outcome,
  Trigger,
  TriggerCause,
  Episode,
  GhostTrace,
  Mission,
  Policy,
  RunEvent,
  SimState,
} from '@rivetrun/contracts';
import { BRIEFING_MAX_CHARS } from '@rivetrun/contracts';
import { heuristicDecide } from './brains';
import { TUNING } from './data';
import { START_TRIGGER, advanceBrain, availableActions, buildQuestion, observe } from './perception';
import { createRun, jumpChargePower, markDecision, step, withAction } from './physics';
import { score } from './score';
import { movingOut, wayOut, type WayOut } from './wayout';
import type { HeadlessOptions, HeadlessResult, RunConfig, RunController, RunControllerOptions, RunState, StepDamage } from './types';

// The package compiles without DOM or Node libs; these exist in every runtime we target.
declare const performance: { now(): number } | undefined;
declare function setTimeout(handler: () => void, ms: number): number;
declare function clearTimeout(handle: number): void;

const MAX_DECISIONS = 2000;
/** Telemetry: one 'observation' event every this many steps (4 × 50 ms = 5 Hz). */
const OBSERVE_EVERY_STEPS = 4;
/** Drive mode: a control change within this long of a trigger counts as the player's reaction to it. */
const REACTION_WINDOW_S = 3;
const WAY_OUT_EVERY_STEPS = 10;
/** One entry per step at most: the longest run always fits, so a logged run can be replayed in full. */
const MAX_INPUT_LOG = Math.ceil((TUNING.maxRunS * 1000) / TUNING.dtMs);
const TICK_MS = 16;
const MAX_FRAME_MS = 100;
/** Continuous damage (water, tip-over) is reported in chunks of this size. */
const DAMAGE_EVENT_PCT = 1;

const ACTION_WORD: Readonly<Record<Action, string>> = {
  accelerate: 'full throttle', cruise: 'steady', slow_down: 'ease', coast: 'coast', brake_soft: 'soft brake', brake: 'brake',
  reverse: 'reverse', climb_mode: 'climb mode', deploy_winch: 'winch', jump: 'jump', scan: 'scan',
};

/** The decision as the showcase shows it: what fired, what the brain knew, its choice and what the wait cost. */
export function decisionLog(question: BrainQuestion, decision: BrainDecision, asked: RunState, applied: RunState): DecisionLog {
  const trigger = question.cause ?? START_TRIGGER;
  const share = decision.probabilities[decision.selected];
  const chip = `${trigger.label} → ${ACTION_WORD[decision.selected]}${share !== undefined ? ` (${Math.round(share * 100)} %)` : ''} · ${Math.round(decision.latencyMs)} ms${decision.fallback ? ' · fallback' : ''}`;
  return {
    t: question.t,
    xM: Math.round(asked.sim.x * 10) / 10,
    trigger,
    knew: question.observation?.lines ?? [],
    unknown: question.observation?.unknown ?? [],
    options: question.lookahead.map((entry) => ({
      action: entry.action,
      probability: decision.probabilities[entry.action] ?? 0,
      progressM: entry.progressM,
      damagePct: entry.damagePct,
      energyPct: entry.energyPct,
      ...(entry.projectedFinishPct !== undefined ? { projectedFinishPct: entry.projectedFinishPct } : {}),
    })),
    choice: decision.selected,
    policy: decision.policy,
    fallback: decision.fallback,
    latencyMs: decision.latencyMs,
    appliedT: applied.sim.t,
    lostM: Math.round((applied.sim.x - asked.sim.x) * 100) / 100,
    chip,
  };
}

function record(question: BrainQuestion, decision: BrainDecision, log?: DecisionLog): DecisionRecord {
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
    ...(log ? { log } : {}),
  };
}

function episodePolicy(decisions: readonly DecisionRecord[], explicit?: Policy): Policy {
  if (explicit) return explicit;
  if (decisions.some((d) => d.policy === 'jev' || d.fallback)) return 'jev';
  return decisions[0]?.policy ?? 'heuristic';
}

/** Fills the result breakdown's decision counts by trigger kind: "7 decisions: 3 perception, 2 energy, 2 body". */
function withDecisionCounts(outcome: Outcome, decisions: readonly DecisionRecord[]): Outcome {
  if (!outcome.breakdown) return outcome;
  const counts: Partial<Record<Trigger['kind'], number>> = {};
  for (const decision of decisions) {
    const kind = decision.log?.trigger.kind;
    if (kind) counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return { ...outcome, breakdown: { ...outcome.breakdown, decisions: counts } };
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
    outcome: withDecisionCounts(score(state), decisions),
  };
}

/**
 * The Brain's answer, or the heuristic's with fallback: true when it fails or picks an unavailable action.
 * With `noFallback` a failure returns null instead: no decision, the last command holds.
 */
async function decideSafe(brain: Brain, question: BrainQuestion, noFallback = false): Promise<BrainDecision | null> {
  try {
    const decision = await brain.decide(question);
    if (question.options.includes(decision.selected)) return decision;
  } catch {
    // Reported through fallback: true on the decision, which the HUD shows; or as a missed decision with noFallback.
  }
  return noFallback ? null : { ...heuristicDecide(question), fallback: true };
}

/**
 * No timers: runs to finish/DNF as fast as possible. Ghost frames at TUNING.ghostHz.
 * Brain v3: a decision is requested only when a trigger fires, the last command holds in between, and the
 * brain's reported latency is applied as sim time, so the same seed and the same latencies give the same run.
 */
export async function runHeadless(
  mission: Mission,
  seed: number,
  build: Build,
  brain: Brain,
  options: HeadlessOptions = {},
): Promise<HeadlessResult> {
  let state = createRun({ mission, seed, build, priority: options.priority ?? 0.5 });
  const briefing = options.briefing?.trim().slice(0, BRIEFING_MAX_CHARS) || undefined;
  const decisions: DecisionRecord[] = [];
  const frames: SimState[] = [state.sim];
  const frameEvery = Math.max(1, Math.round(1000 / TUNING.ghostHz / TUNING.dtMs));
  let trigger: Trigger | null = START_TRIGGER;
  let queued: Trigger | null = null;
  let pending: { question: BrainQuestion; decision: BrainDecision; asked: RunState; applyAtStep: number } | null = null;
  let missed = 0;
  while (!state.done) {
    if (trigger && pending) queued = trigger;
    if (trigger && !pending) {
      const question = buildQuestion(state, trigger, briefing);
      // Brains may be async (Jev over HTTP on the server): each answer is awaited, then delayed by its own latency.
      const decision = await decideSafe(brain, question, options.noFallback === true);
      state = markDecision(state);
      // No-fallback mode: a brain that fails gives no decision at all. The command in force simply holds.
      if (decision) pending = { question, decision, asked: state, applyAtStep: state.stepCount + Math.round(decision.latencyMs / TUNING.dtMs) };
      else missed += 1;
    }
    if (pending && state.stepCount >= pending.applyAtStep) {
      state = withAction(state, pending.decision.selected);
      decisions.push(record(pending.question, pending.decision, decisionLog(pending.question, pending.decision, pending.asked, state)));
      pending = null;
      if (queued) {
        trigger = queued;
        queued = null;
        continue;
      }
    }
    state = step(state, state.action);
    ({ trigger, state } = advanceBrain(state));
    if (state.stepCount % frameEvery === 0 || state.done) frames.push(state.sim);
  }
  const policy = episodePolicy(decisions, options.policy);
  const episode = toEpisode(state, decisions, policy, `${mission.id}-${state.config.seed}-${policy}-headless`);
  // The ghost carries its driver's decision log on its own clock, so a replay can show the thread in sync with the frames.
  const log = decisions.flatMap((decision) => (decision.log ? [decision.log] : []));
  return { episode, ghost: { policy, frames, outcome: episode.outcome, log }, missedDecisions: missed };
}

/** The same loop without a Brain object, for the synchronous callers (test run): heuristic, zero latency. */
export function runHeuristicSync(config: RunConfig, onStep?: (prev: RunState, next: RunState) => void): { state: RunState; decisions: DecisionRecord[] } {
  let state = createRun(config);
  const decisions: DecisionRecord[] = [];
  let trigger: Trigger | null = START_TRIGGER;
  while (!state.done) {
    if (trigger) {
      const question = buildQuestion(state, trigger);
      const decision = heuristicDecide(question);
      const asked = markDecision(state);
      state = withAction(asked, decision.selected);
      decisions.push(record(question, decision, decisionLog(question, decision, asked, state)));
    }
    const prev = state;
    state = step(state, state.action);
    onStep?.(prev, state);
    ({ trigger, state } = advanceBrain(state));
  }
  return { state, decisions };
}

/** A hit the build had no forward sensor to see coming: "BLIND · hit rock at 22 m: no distance sensor". */
function blindNote(state: RunState, damage: StepDamage): { blind?: true; label?: string } {
  if (damage.cause !== 'impact' || damage.obstacle === undefined) return {};
  const forward = Math.max(state.spec.sensorRangeM.ultrasonic ?? 0, state.spec.sensorRangeM.camera ?? 0, state.spec.sensorRangeM.scout_drone ?? 0);
  if (forward > 0) return { label: `${damage.blocked ? 'Stopped by' : 'Hit'} the ${damage.obstacle} at ${Math.round(state.sim.x)} m` };
  return { blind: true, label: `BLIND · hit ${damage.obstacle} at ${Math.round(state.sim.x)} m: no distance sensor` };
}

/** Everything one step produces besides decisions: frame, terrain change, damage and air events. */
function emitStepEvents(
  emit: (event: RunEvent) => void,
  prev: RunState,
  state: RunState,
  pendingDamage: Partial<Record<DamageCause, number>>,
): void {
  emit({ type: 'frame', state: state.sim });
  if (state.segmentIndex !== prev.segmentIndex) {
    emit({ type: 'terrainEnter', t: state.sim.t, terrain: state.sim.terrain, segmentIndex: state.segmentIndex });
  }
  if (state.sim.gust !== undefined && state.sim.gust !== (prev.sim.gust ?? false)) emit({ type: 'gust', t: state.sim.t, on: state.sim.gust, windMps: state.sim.windMps ?? 0 });
  const air = state.lastAir;
  if (air?.type === 'airborne') emit({ type: 'airborne', t: state.sim.t, x: state.sim.x, v: state.sim.v, vy: state.vy, cause: air.cause });
  if (air?.type === 'landed') emit({ type: 'landed', t: state.sim.t, x: state.sim.x, impactMps: air.impactMps, airtimeS: air.airtimeS, damagePct: air.damagePct, ...(air.grade ? { grade: air.grade, pitchErrorDeg: air.pitchErrorDeg } : {}) });
  if (air?.type === 'fell') emit({ type: 'fell', t: state.sim.t, x: air.fromX, falls: air.falls, respawnX: air.respawnX });
  const damage = state.lastDamage;
  if (damage) {
    const total = (pendingDamage[damage.cause] ?? 0) + damage.amountPct;
    if (damage.cause === 'impact' || total >= DAMAGE_EVENT_PCT || state.done) {
      emit({
        type: 'damage', t: state.sim.t, cause: damage.cause, amountPct: total, totalPct: Math.min(100, state.sim.damage),
        ...(damage.obstacle ? { obstacle: damage.obstacle } : {}),
        ...(damage.blocked ? { blocked: true } : {}),
        ...(damage.roughEntry ? { roughEntry: damage.roughEntry } : {}),
        ...(damage.air ? { air: damage.air } : {}),
        ...blindNote(state, damage),
      });
      pendingDamage[damage.cause] = 0;
    } else {
      pendingDamage[damage.cause] = total;
    }
  }
}

const level = (value: boolean | number): number => (typeof value === 'number' ? Math.min(1, Math.max(0, value)) : value ? 1 : 0);

/**
 * Drive mode: the player's thumbs as one of the Actions the Brains use, so the physics is shared.
 * Gameplay v3: throttle and brake are 0..1 (a boolean is 0 or 1). Throttle maps to full / steady / ease / coast,
 * brake to hard / soft; with nothing held the robot coasts.
 */
export function controlToAction(input: ControlInput, build: Build): Action {
  const actions = availableActions(build);
  const throttle = level(input.throttle);
  const brake = level(input.brake);
  if (input.special === 'jump' && actions.includes('jump')) return 'jump';
  if (brake >= 0.6) return 'brake';
  if (brake >= 0.1) return 'brake_soft';
  if (input.special === 'winch' && actions.includes('deploy_winch')) return 'deploy_winch';
  if (input.special === 'climb' && throttle > 0) return 'climb_mode';
  if (throttle >= 0.85) return 'accelerate';
  if (throttle >= 0.5) return 'cruise';
  if (throttle >= 0.15) return 'slow_down';
  return 'coast';
}

export interface DriveLogEntry {
  readonly t: number;
  readonly throttle: number;
  readonly brake: number;
  readonly special?: ControlInput['special'];
  readonly jumpHeld?: boolean;
  readonly action: Action;
}

/** One step of a player's run: the input as an action, the piston charging while the button is held and firing on release. */
function driveStep(state: RunState, input: ControlInput, chargeS: number, build: Build): { state: RunState; action: Action; chargeS: number } {
  const charging = input.jumpHeld === true && state.spec.jumpImpulseMps > 0 && state.sim.t >= state.jumpReadyT && !state.airborne;
  const release = !charging && chargeS > 0;
  const action = release ? 'jump' : controlToAction(input, build);
  const held = charging ? chargeS + TUNING.dtMs / 1000 : chargeS;
  const next = step({ ...state, jumpChargeS: charging ? held : undefined, ...(release ? { jumpPower: jumpChargePower(chargeS) } : {}) }, action);
  return { state: next, action, chargeS: release ? 0 : held };
}

/**
 * Replays a logged Drive run without a player or a clock: the same mission, seed, build and input log give the same
 * run, step for step. For the Brain Arena's human rows and for checking a submitted run.
 */
export function replayDrive(config: RunConfig, inputLog: readonly DriveLogEntry[]): { episode: Episode; ghost: GhostTrace } {
  let state = createRun({ ...config, manual: true });
  let chargeS = 0;
  let cursor = -1;
  const frames: SimState[] = [state.sim];
  const frameEvery = Math.max(1, Math.round(1000 / TUNING.ghostHz / TUNING.dtMs));
  while (!state.done) {
    while (cursor + 1 < inputLog.length && inputLog[cursor + 1]!.t <= state.sim.t + 1e-9) cursor += 1;
    const entry = cursor >= 0 ? inputLog[cursor]! : undefined;
    const input: ControlInput = entry
      ? { throttle: entry.throttle, brake: entry.brake, ...(entry.special ? { special: entry.special } : {}), ...(entry.jumpHeld ? { jumpHeld: true } : {}) }
      : { throttle: 0, brake: 0 };
    const driven = driveStep(state, input, chargeS, config.build);
    // The live loop also runs the trigger detector for its HUD hints; that only writes the brain's memory, never the physics.
    state = driven.state;
    chargeS = driven.chargeS;
    if (state.stepCount % frameEvery === 0 || state.done) frames.push(state.sim);
  }
  const episode = toEpisode(state, [], 'human', `${config.mission.id}-${state.config.seed}-human-replay`);
  return { episode, ghost: { policy: 'human', frames, outcome: episode.outcome } };
}

/**
 * Drive mode loop: every 50 ms step reads the player's input (20 Hz) and applies it. No decisions, no slow-mo.
 * Emits the same RunEvent stream as runController and resolves with an Episode whose policy is 'human'.
 */
export function driveController(config: RunConfig, readInput: () => ControlInput, options: RunControllerOptions): RunController {
  const emit = (event: RunEvent): void => options.onEvent(event);
  const timeScale = options.timeScale ?? 1;
  let stopped = false;
  let timer: number | undefined;
  let started: Promise<Episode> | undefined;
  let finish: (() => void) | undefined;

  const run = (): Promise<Episode> =>
    new Promise<Episode>((resolve) => {
      let state = createRun({ ...config, manual: true });
      const pendingDamage: Partial<Record<DamageCause, number>> = {};
      const reactions: { id?: string; t: number; xM: number; label: string; cause: TriggerCause; humanS: number | null }[] = [];
      const inputLog: DriveLogEntry[] = [];
      let lastInput: { throttle: number; brake: number; special?: ControlInput['special']; jumpHeld: boolean } = { throttle: -1, brake: -1, jumpHeld: false };
      let lastAction: Action | undefined;
      // Charged jump: seconds the button has been held; fires when it is let go.
      let chargeS = 0;
      let hint: WayOut | undefined;
      let recovering = false;
      let accumulatedMs = 0;
      let last = now();
      const complete = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        const episode = toEpisode(state, [], 'human', newEpisodeId(state));
        const breakdown = episode.outcome.breakdown;
        resolve(breakdown ? { ...episode, outcome: { ...episode.outcome, breakdown: { ...breakdown, reactions: reactions.map((r) => ({ ...r })), inputLog: inputLog.map((entry) => ({ ...entry })) } } } : episode);
      };
      finish = complete;
      const tick = (): void => {
        if (stopped) return;
        const current = now();
        accumulatedMs += Math.min(current - last, MAX_FRAME_MS) * timeScale;
        last = current;
        while (accumulatedMs >= TUNING.dtMs && !state.done) {
          accumulatedMs -= TUNING.dtMs;
          const prev = state;
          const input = readInput();
          const driven = driveStep(state, input, chargeS, config.build);
          const action = driven.action;
          state = driven.state;
          chargeS = driven.chargeS;
          // Getting nowhere: tell the player which command frees this build. Checked twice a second, kept in between.
          // No countdown while the command in force is already getting the robot out (climb mode just switched on).
          if (state.sim.stuckInS === undefined) {
            hint = undefined;
            recovering = false;
          } else if (state.action !== prev.action || state.stepCount % WAY_OUT_EVERY_STEPS === 0 || (hint === undefined && !recovering)) {
            recovering = movingOut(state);
            hint = recovering ? undefined : wayOut(state);
          }
          if (state.sim.stuckInS !== undefined) {
            const { stuckInS: _countdown, ...calm } = state.sim;
            state = { ...state, sim: recovering ? calm : hint ? { ...state.sim, freeWith: hint } : state.sim };
          }
          emitStepEvents(emit, prev, state, pendingDamage);
          if (state.stepCount % OBSERVE_EVERY_STEPS === 0) {
            emit({ type: 'observation', t: state.sim.t, observation: observe(state), control: { throttle: level(input.throttle), brake: level(input.brake), action } });
          }
          const throttle = level(input.throttle);
          const brake = level(input.brake);
          const jumpHeld = input.jumpHeld === true;
          if (throttle !== lastInput.throttle || brake !== lastInput.brake || input.special !== lastInput.special || jumpHeld !== lastInput.jumpHeld) {
            lastInput = { throttle, brake, special: input.special, jumpHeld };
            // Stamped with the clock the step started on: the replay looks inputs up by it.
            if (inputLog.length < MAX_INPUT_LOG) inputLog.push({ t: prev.sim.t, throttle, brake, ...(input.special ? { special: input.special } : {}), ...(jumpHeld ? { jumpHeld } : {}), action });
          }
          // Reaction: the first change of command after something was detected.
          if (lastAction !== undefined && action !== lastAction) {
            for (const reaction of reactions) {
              if (reaction.humanS === null && state.sim.t - reaction.t <= REACTION_WINDOW_S) reaction.humanS = Math.round((state.sim.t - reaction.t) * 100) / 100;
            }
          }
          lastAction = action;
          // HUD hints: the heuristic's read of each change, from the same Observation. Shown, never applied.
          const advanced = advanceBrain(state);
          state = advanced.state;
          if (advanced.trigger && options.hints !== false) {
            const question = buildQuestion(state, advanced.trigger);
            const decision = heuristicDecide(question);
            emit({ type: 'decision', t: state.sim.t, question, decision, log: decisionLog(question, decision, state, state), advisory: true });
            // The reaction duel is about what the robot detected: perception events, each with its pairing id.
            if (advanced.trigger.kind === 'perception') {
              reactions.push({
                ...(advanced.trigger.eventId ? { id: advanced.trigger.eventId } : {}),
                t: state.sim.t, xM: Math.round(state.sim.x * 10) / 10, label: advanced.trigger.label, cause: advanced.trigger.cause, humanS: null,
              });
            }
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
      finish?.();
    },
    isDecisionPending: () => false,
  };
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
  // Brain v3: latency is real, so the run does not slow down while the brain thinks unless a caller asks for it.
  const slowMoFactor = options.slowMo === true ? TUNING.decision.slowMoFactor : 1;
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

      let queued: Trigger | null = null;
      const ask = (trigger: Trigger): void => {
        pending = true;
        const question = buildQuestion(state, trigger, briefing);
        state = markDecision(state);
        const asked = state;
        emit({ type: 'decisionPending', t: question.t, question });
        void decideSafe(brain, question).then((decision) => {
          // A decision that lands after the run ended is dropped: nothing follows finish / dnf.
          if (stopped || state.done || !decision) return;
          // Latency is real: the old command held while the brain thought, and the choice applies now.
          state = withAction(state, decision.selected);
          const log = decisionLog(question, decision, asked, state);
          decisions.push(record(question, decision, log));
          pending = false;
          emit({ type: 'decision', t: state.sim.t, question, decision, log });
          if (queued) {
            const next = queued;
            queued = null;
            ask(next);
          }
        });
      };

      const emitStep = (prev: RunState): void => emitStepEvents(emit, prev, state, pendingDamage);

      const tick = (): void => {
        if (stopped) return;
        const current = now();
        const elapsed = Math.min(current - last, MAX_FRAME_MS);
        last = current;
        accumulatedMs += elapsed * timeScale * (pending ? slowMoFactor : 1);
        while (accumulatedMs >= TUNING.dtMs && !state.done) {
          accumulatedMs -= TUNING.dtMs;
          const prev = state;
          state = step(state, state.action);
          emitStep(prev);
          if (state.stepCount % OBSERVE_EVERY_STEPS === 0) emit({ type: 'observation', t: state.sim.t, observation: observe(state) });
          const advanced = advanceBrain(state);
          state = advanced.state;
          if (state.done || !advanced.trigger) continue;
          if (pending) {
            queued = advanced.trigger;
          } else {
            ask(advanced.trigger);
            accumulatedMs *= slowMoFactor;
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
      ask(START_TRIGGER);
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
