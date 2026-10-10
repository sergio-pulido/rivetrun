// Runs a Lab mission with brains in the loop. Same rules as the rail (RR-BRAIN-V3): a decision is asked only
// when a trigger fires, the last command holds meanwhile, and the answer takes effect after its latency.
import type { Build, Policy, TriggerKind } from '@rivetrun/contracts';
import { command, createLab, retire, setPace, stepLab } from './engine';
import { buildLabQuestion } from './observe';
import type { Pace } from './robot';
import type { LabBrain, LabDecision, LabOption, LabQuestion } from './schema';
import { scoreLab, type LabOutcome } from './score';
import type { AgentStatus, Cell, Dir, LabCommand, LabEvent, LabScenario, LabState, LabTrigger } from './types';

export interface LabRunEntry {
  readonly agentId: string;
  readonly build: Build;
  /** Absent = nobody decides for this robot: it is driven with `driver.command`. */
  readonly brain?: LabBrain;
  /** Label for the log. Default: the policy the brain reports, else 'heuristic'. */
  readonly policy?: Policy;
  readonly pace?: Pace;
  /** The player's instructions to the driver; put on every question. */
  readonly briefing?: string;
}

export interface LabRunOptions {
  /** A robot is asked at most this many times; past it, it holds its last command. Default 300. */
  readonly maxDecisions?: number;
  /** Record a frame every this many steps (0 = none). Default 0. */
  readonly frameEvery?: number;
  /** Live play: the wait for an answer has already passed on the sim clock, so answers apply at once. Default false. */
  readonly live?: boolean;
}

/** One decision as the showcase shows it: what fired, what the brain knew, what it chose and what the wait cost. */
export interface LabDecisionLog {
  readonly agentId: string;
  /** Sim time and tile when the decision was requested. */
  readonly t: number;
  readonly cell: Cell;
  readonly trigger: LabTrigger;
  readonly knew: readonly string[];
  readonly unknown: readonly string[];
  readonly options: readonly { readonly id: string; readonly label: string; readonly probability: number; readonly steps?: number; readonly batteryAfterPct?: number }[];
  readonly choice: string;
  readonly choiceLabel: string;
  readonly policy: Policy;
  /** True when the brain asked did not answer and the fixed rules decided instead. */
  readonly fallback: boolean;
  /** True when the answer came from a cache of an identical question, not from a fresh call. */
  readonly cached: boolean;
  /** The wording of the question the brain answered, when it says. */
  readonly question?: string;
  readonly latencyMs: number;
  /** Sim time at which the choice took effect. */
  readonly appliedT: number;
  /** Ready-made chip text, e.g. "LIDAR · junction: left and ahead open → Explore west (71 %) · 340 ms". */
  readonly chip: string;
}

/** A decision that was asked for and not given: the brain threw, or named an option that was not on offer. */
export interface LabMiss {
  readonly agentId: string;
  readonly t: number;
  readonly reason: string;
}

/** What a replay needs for one moment: poses, charge and what has been done. */
export interface LabFrame {
  readonly t: number;
  readonly agents: readonly {
    readonly id: string; readonly cell: Cell; readonly to?: Cell; readonly progress: number; readonly heading: Dir;
    readonly batteryPct: number; readonly damagePct: number; readonly carrying: readonly string[]; readonly status: AgentStatus;
  }[];
  readonly movers: readonly { readonly id: string; readonly cell: Cell; readonly to: Cell; readonly progress: number }[];
  readonly objects: readonly { readonly id: string; readonly at: Cell; readonly status: string }[];
  readonly doorsOpen: readonly number[];
}

export interface LabRunResult {
  readonly scenarioId: string;
  readonly seed: number;
  /** Per robot id. */
  readonly outcomes: Readonly<Record<string, LabOutcome>>;
  readonly decisions: readonly LabDecisionLog[];
  readonly misses: readonly LabMiss[];
  readonly events: readonly LabEvent[];
  readonly frames: readonly LabFrame[];
  readonly final: LabState;
}

export interface LabDriver {
  readonly state: LabState;
  readonly done: boolean;
  /** The decisions applied so far, oldest first. */
  readonly decisions: readonly LabDecisionLog[];
  readonly misses: readonly LabMiss[];
  /** Questions due now: one per brain-driven robot that has a trigger and no answer outstanding. Each is handed out once. */
  questions(): { agentId: string; question: LabQuestion }[];
  /** The answer to a question from `questions()`. `undefined` or an option not on offer = no decision: the last command holds. */
  answer(agentId: string, decision: LabDecision | undefined, reason?: string): void;
  /** A command from outside a brain, e.g. the player's arrow pad. */
  command(agentId: string, next: LabCommand): void;
  setPace(agentId: string, pace: Pace): void;
  /** Applies the answers that are due, then one step. */
  advance(): void;
  result(): LabRunResult;
}

const RANK: Readonly<Record<TriggerKind, number>> = { start: 5, body: 4, energy: 3, actuator: 2, perception: 1 };

export function frameOf(state: LabState): LabFrame {
  return {
    t: state.t,
    agents: state.agents.map((a) => ({
      id: a.id, cell: a.cell, ...(a.move ? { to: a.move.to } : {}), progress: a.move?.progress ?? 0, heading: a.heading,
      batteryPct: Math.round(a.batteryPct * 10) / 10, damagePct: Math.round(a.damagePct * 10) / 10, carrying: a.carrying, status: a.status,
    })),
    movers: state.movers.map((m) => ({ id: m.id, cell: m.route[m.index]!, to: m.route[(m.index + 1) % m.route.length]!, progress: m.progress })),
    objects: state.objects.map((o) => ({ id: o.id, at: o.at, status: o.status })),
    doorsOpen: state.doorsOpen,
  };
}

/** What an option does to the run when chosen. */
export function applyOption(state: LabState, agentId: string, option: LabOption): LabState {
  const paced = option.pace !== undefined ? setPace(state, agentId, option.pace) : state;
  return option.command !== undefined ? command(paced, agentId, option.command as LabCommand) : paced;
}

/**
 * The run as a state machine, so the same loop serves headless runs (await each brain) and live play (answers
 * arrive whenever the model replies). Its variables are private to the closure.
 */
export function createLabDriver(scenario: LabScenario, seed: number, entries: readonly LabRunEntry[], options: LabRunOptions = {}): LabDriver {
  const maxDecisions = options.maxDecisions ?? 300;
  const frameEvery = options.frameEvery ?? 0;
  let state = createLab({ scenario, seed, entries: entries.map((e) => ({ agentId: e.agentId, build: e.build, ...(e.policy ? { policy: e.policy } : {}), ...(e.pace ? { pace: e.pace } : {}) })) });
  const asked = new Map<string, { question: LabQuestion; askedT: number }>();
  const due = new Map<string, { applyT: number; option: LabOption; log: LabDecisionLog }>();
  /** The most urgent trigger that fired while a robot was waiting for an answer: asked about as soon as that answer is in. */
  const queued = new Map<string, LabTrigger>();
  const count = new Map<string, number>();
  const decisions: LabDecisionLog[] = [];
  const misses: LabMiss[] = [];
  const events: LabEvent[] = [];
  const frames: LabFrame[] = frameEvery > 0 ? [frameOf(state)] : [];

  /** A trigger lasts one step in the sim. Keep the most urgent one per robot until it has been asked about. */
  const latch = (): void => {
    for (const agent of state.agents) {
      const held = queued.get(agent.id);
      // A robot standing still because its answer is on the way is not asking to be asked again.
      const waiting = agent.trigger?.cause === 'idle' && (asked.has(agent.id) || due.has(agent.id));
      if (agent.trigger !== undefined && !waiting && (held === undefined || RANK[agent.trigger.kind] > RANK[held.kind])) queued.set(agent.id, agent.trigger);
    }
  };
  latch();

  const questions = (): { agentId: string; question: LabQuestion }[] => {
    const out: { agentId: string; question: LabQuestion }[] = [];
    for (const entry of entries) {
      const agent = state.agents.find((a) => a.id === entry.agentId);
      if (!agent || agent.status !== 'running' || entry.brain === undefined) continue;
      // One question at a time: a robot waiting for an answer is asked about what has piled up once that answer is in.
      if (asked.has(agent.id) || due.has(agent.id)) continue;
      const trigger = queued.get(agent.id);
      if (trigger === undefined || (count.get(agent.id) ?? 0) >= maxDecisions) continue;
      queued.delete(agent.id);
      const built = buildLabQuestion(state, agent.id, trigger, entry.briefing);
      // Waiting and changing pace are always on offer; with nothing else to choose there is nothing left to do.
      const question = built?.options.some((option) => option.kind !== 'wait' && option.kind !== 'pace') ? built : undefined;
      if (question === undefined) {
        // Standing still with no move on offer, and nobody else on the map to change that: this robot's run is over.
        const alone = state.agents.every((other) => other.id === agent.id || other.status !== 'running');
        if (alone && agent.command.type === 'idle' && agent.move === undefined && agent.busy === undefined) {
          state = retire(state, agent.id, 'stuck');
          events.push(...state.events);
        }
        continue;
      }
      asked.set(agent.id, { question, askedT: state.t });
      count.set(agent.id, (count.get(agent.id) ?? 0) + 1);
      out.push({ agentId: agent.id, question });
    }
    return out;
  };

  const answer = (agentId: string, decision: LabDecision | undefined, reason?: string): void => {
    const pending = asked.get(agentId);
    if (pending === undefined) return;
    asked.delete(agentId);
    const { question, askedT } = pending;
    const option = decision !== undefined ? question.options.find((o) => o.id === decision.choice) : undefined;
    if (decision === undefined || option === undefined) {
      misses.push({ agentId, t: state.t, reason: reason ?? (decision === undefined ? 'no answer' : `"${decision.choice}" was not on offer`) });
      return;
    }
    const applyT = options.live ? state.t : askedT + decision.latencyMs / 1000;
    const probability = decision.probabilities?.[option.id];
    // A fallback is the fixed rules' decision whatever the entry is labelled.
    const policy = decision.fallback ? (decision.policy ?? 'heuristic') : (entries.find((e) => e.agentId === agentId)?.policy ?? decision.policy ?? 'heuristic');
    const agent = state.agents.find((a) => a.id === agentId)!;
    const log: LabDecisionLog = {
      agentId, t: askedT, cell: question.observation.cell, trigger: question.trigger, knew: question.knew, unknown: question.unknown,
      options: question.options.map((o) => ({
        id: o.id, label: o.label, probability: decision.probabilities?.[o.id] ?? (o.id === option.id ? 1 : 0),
        ...(o.predicted?.steps !== undefined ? { steps: o.predicted.steps } : {}),
        ...(o.predicted?.batteryAfterPct !== undefined ? { batteryAfterPct: o.predicted.batteryAfterPct } : {}),
      })),
      choice: option.id, choiceLabel: option.label, policy, fallback: decision.fallback === true, cached: decision.cached === true,
      ...(decision.question !== undefined ? { question: decision.question } : {}),
      latencyMs: decision.latencyMs, appliedT: applyT,
      chip: `${question.trigger.label} → ${option.label}${decision.fallback ? ' (FALLBACK)' : probability !== undefined ? ` (${Math.round(probability * 100)} %)` : ''} · ${decision.cached ? 'cached' : `${Math.round(decision.latencyMs)} ms`}`,
    };
    if (agent.status === 'running') due.set(agentId, { applyT, option, log });
  };

  const advance = (): void => {
    if (state.done) return;
    for (const [agentId, pending] of due) {
      if (state.t + 1e-9 < pending.applyT) continue;
      state = applyOption(state, agentId, pending.option);
      decisions.push({ ...pending.log, appliedT: state.t });
      due.delete(agentId);
    }
    state = stepLab(state);
    latch();
    events.push(...state.events);
    if (frameEvery > 0 && (state.tick % frameEvery === 0 || state.done)) frames.push(frameOf(state));
  };

  return {
    get state() { return state; },
    get done() { return state.done; },
    get decisions() { return decisions; },
    get misses() { return misses; },
    questions,
    answer,
    command: (agentId, next) => { state = command(state, agentId, next); },
    setPace: (agentId, pace) => { state = setPace(state, agentId, pace); },
    advance,
    result: () => ({
      scenarioId: scenario.id, seed,
      outcomes: Object.fromEntries(state.agents.map((a) => [a.id, scoreLab(state, a.id)])),
      decisions, misses, events, frames, final: state,
    }),
  };
}

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : 'the brain threw');

/**
 * A whole mission with every robot driven by a brain, as fast as the brains answer. No fallback inside the sim:
 * a decision that throws, or names an option that was not on offer, is a miss and the last command holds.
 */
export async function runLabEntries(scenario: LabScenario, seed: number, entries: readonly LabRunEntry[], options: LabRunOptions = {}): Promise<LabRunResult> {
  const driver = createLabDriver(scenario, seed, entries, options);
  while (!driver.done) {
    for (const { agentId, question } of driver.questions()) {
      const brain = entries.find((e) => e.agentId === agentId)!.brain!;
      try {
        driver.answer(agentId, await brain.decide(question));
      } catch (error: unknown) {
        driver.answer(agentId, undefined, reasonOf(error));
      }
    }
    driver.advance();
  }
  return driver.result();
}

/** The same run with deciders that answer at once, without promises: for tests, balance scripts and previews. */
export function runLabSync(
  scenario: LabScenario, seed: number,
  entries: readonly (Omit<LabRunEntry, 'brain'> & { readonly decide: (question: LabQuestion) => LabDecision })[],
  options: LabRunOptions = {},
): LabRunResult {
  // The driver only needs to know a robot has a brain; the answers come from `decide`.
  const placeholder: LabBrain = { decide: async () => { throw new Error('@rivetrun/lab: runLabSync answers through `decide`'); } };
  const driver = createLabDriver(scenario, seed, entries.map((e) => ({ ...e, brain: placeholder })), options);
  while (!driver.done) {
    for (const { agentId, question } of driver.questions()) {
      try {
        driver.answer(agentId, entries.find((e) => e.agentId === agentId)!.decide(question));
      } catch (error: unknown) {
        driver.answer(agentId, undefined, reasonOf(error));
      }
    }
    driver.advance();
  }
  return driver.result();
}
