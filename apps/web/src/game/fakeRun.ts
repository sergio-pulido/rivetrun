// Stand-in for packages/sim until it works: a plausible run that emits the real
// RunEvent / GhostTrace shapes so the scene and HUD can be built and judged.
// Nothing here is game truth. Delete the callers once runController exists.
import type {
  Action,
  BrainDecision,
  BrainQuestion,
  Build,
  DecisionTrigger,
  DnfReason,
  GhostTrace,
  LookaheadEntry,
  Mission,
  Outcome,
  Perception,
  Policy,
  RunEvent,
  Segment,
  SimEffect,
  SimState,
} from '@rivetrun/contracts';
import { PARTS_BY_ID, TERRAINS, TUNING } from '@rivetrun/sim';
import { clamp, mulberry32 } from './rng';

const DT = TUNING.dtMs / 1000;

interface Caps {
  readonly topSpeed: number;
  readonly torque: number;
  readonly grip: Partial<Record<string, number>>;
  readonly sinkFactor: number;
  readonly maxSlope: number;
  readonly sensors: ReadonlySet<string>;
  readonly waterproof: boolean;
  readonly impactFactor: number;
  readonly winch: boolean;
  readonly powerW: number;
  readonly capacityWh: number;
  readonly costEur: number;
}

function capsOf(build: Build): Caps {
  const ids = [build.locomotion, build.motor, build.battery, ...build.sensors, ...build.extras];
  const parts = ids.flatMap((id) => {
    const part = PARTS_BY_ID.get(id);
    return part ? [part] : [];
  });
  const fx = parts.map((part) => part.effects);
  return {
    topSpeed: fx.find((e) => e.topSpeedMps)?.topSpeedMps ?? 2,
    torque: fx.find((e) => e.torqueNm)?.torqueNm ?? 1,
    grip: fx.find((e) => e.grip)?.grip ?? {},
    sinkFactor: fx.find((e) => e.sinkageFactor)?.sinkageFactor ?? 1,
    maxSlope: fx.find((e) => e.maxSlopeDeg)?.maxSlopeDeg ?? 20,
    sensors: new Set(fx.flatMap((e) => (e.sensor ? [e.sensor] : []))),
    waterproof: fx.some((e) => e.waterproof),
    impactFactor: fx.find((e) => e.impactDamageFactor !== undefined)?.impactDamageFactor ?? 1,
    winch: fx.some((e) => e.extra === 'winch'),
    powerW: parts.reduce((sum, part) => sum + part.powerW, 0),
    capacityWh: fx.find((e) => e.capacityWh)?.capacityWh ?? 1,
    costEur: parts.reduce((sum, part) => sum + part.costEur, 0),
  };
}

const DRIVE: Readonly<Record<Action, number>> = {
  cruise: 0.7,
  accelerate: 1,
  slow_down: 0.38,
  brake: 0,
  reverse: -0.3,
  climb_mode: 0.5,
  deploy_winch: 0.34,
  jump: 0.9,
};

interface Core {
  t: number;
  x: number;
  v: number;
  battery: number;
  damage: number;
  action: Action;
  slipPct: number;
  stuckS: number;
  wheelSpin: number;
  effects: SimEffect[];
  hit: Set<number>;
  damageEvent: number;
}

interface World {
  readonly mission: Mission;
  readonly caps: Caps;
  readonly starts: readonly number[];
  readonly lengthM: number;
}

function worldOf(mission: Mission, build: Build): World {
  const starts: number[] = [];
  let s = 0;
  for (const segment of mission.track.segments) {
    starts.push(s);
    s += segment.lengthM;
  }
  return { mission, caps: capsOf(build), starts, lengthM: s };
}

function indexAt(world: World, x: number): number {
  const { starts } = world;
  let index = 0;
  for (let i = 0; i < starts.length; i += 1) if (x >= starts[i]!) index = i;
  return index;
}

const segmentOf = (world: World, index: number): Segment => world.mission.track.segments[index]!;

function stepCore(world: World, core: Core): void {
  const { caps } = world;
  const index = indexAt(world, core.x);
  const segment = segmentOf(world, index);
  const terrain = TERRAINS[segment.terrain];
  const grip = terrain.baseFriction * (caps.grip[segment.terrain] ?? 1);
  const drive = DRIVE[core.action];
  const helped = core.action === 'climb_mode' || core.action === 'deploy_winch';
  const sink = terrain.sinkage * caps.sinkFactor;
  const uphill = Math.max(0, segment.slopeDeg) / caps.maxSlope;
  const slopeFactor = 1 - uphill * (core.action === 'deploy_winch' ? 0.1 : helped ? 0.35 : 0.8);
  const surface = clamp(0.35 + grip * 0.9, 0.3, 1) * (1 - sink * 0.6);
  const target = caps.topSpeed * drive * surface * Math.max(0.12, slopeFactor);

  const slip = helped ? 0 : clamp((0.36 - grip) / 0.36, 0, 1) * Math.abs(drive);
  core.slipPct = slip * 100;
  const accel = target > core.v ? 1.6 + caps.torque * 0.8 : 3.4;
  core.v += clamp(target - core.v, -accel * DT, accel * DT) * (1 - slip * 0.5);
  core.x += core.v * DT;
  core.t += DT;
  core.wheelSpin = (core.v / 0.32) * (1 + slip * 2.2) + slip * drive * 9;

  const effects: SimEffect[] = [];
  const moving = Math.abs(core.v) > 0.25;
  if (slip > 0.25) effects.push('slip');
  if (moving && segment.terrain === 'water') effects.push('splash');
  if (moving && segment.terrain === 'mud') effects.push('mud_spray');
  if (moving && (segment.terrain === 'sand' || (segment.terrain === 'rock' && core.v > 1))) effects.push('dust');
  if (core.action === 'deploy_winch') effects.push('winch');

  core.damageEvent = 0;
  if (segment.obstacle && !core.hit.has(index)) {
    const at = world.starts[index]! + segment.lengthM / 2;
    if (core.x >= at - 0.55) {
      core.hit.add(index);
      const speed = Math.abs(core.v);
      const dealt = helped ? 0 : Math.max(0, speed - 0.7) * 16 * (0.4 + terrain.impactRisk) * caps.impactFactor;
      if (dealt > 0.5) {
        core.damageEvent = dealt;
        core.v *= 0.35;
        effects.push('sparks');
      }
    }
  }
  if (segment.terrain === 'water' && !caps.waterproof) {
    core.damage += terrain.waterDamage * ((segment.depthCm ?? 8) / 10) * DT * 1.6;
  }
  core.damage = clamp(core.damage + core.damageEvent, 0, 100);
  if (core.damage > 55) effects.push('smoke');

  const load = (0.25 + Math.abs(drive)) * (1 + sink + uphill * 1.5) + slip;
  core.battery = clamp(core.battery - ((caps.powerW * load * DT) / (caps.capacityWh * 3600)) * 100 * 1.25, 0, 100);
  core.stuckS = Math.abs(core.v) < 0.06 && core.action !== 'brake' ? core.stuckS + DT : 0;
  core.effects = effects;
}

function simStateOf(world: World, core: Core): SimState {
  const segment = segmentOf(world, indexAt(world, clamp(core.x, 0, world.lengthM - 0.001)));
  return {
    t: core.t,
    x: core.x,
    v: core.v,
    slopeDeg: segment.slopeDeg,
    pitch: segment.slopeDeg,
    wheelSpin: core.wheelSpin,
    terrain: segment.terrain,
    battery: core.battery,
    damage: core.damage,
    effects: core.effects,
  };
}

function endReason(world: World, core: Core): DnfReason | 'finish' | null {
  if (core.x >= world.lengthM) return 'finish';
  if (core.damage >= 100) return 'damage';
  if (core.battery <= 0) return 'battery';
  if (core.stuckS > 6) return 'stuck';
  if (core.t > 120) return 'timeout';
  return null;
}

function outcomeOf(world: World, core: Core, reason: DnfReason | 'finish'): Outcome {
  const finished = reason === 'finish';
  const progressFraction = clamp(core.x / world.lengthM, 0, 1);
  const energyUsedPct = 100 - core.battery;
  const s = TUNING.score;
  const score = finished
    ? s.base - s.perSecond * core.t - s.perDamagePct * core.damage - s.perEnergyPct * energyUsedPct - world.caps.costEur / s.costDivisor
    : s.dnfMax * progressFraction;
  const threshold = world.mission.starThreshold;
  return {
    finished,
    timeS: core.t,
    damagePct: core.damage,
    energyUsedPct,
    costEur: world.caps.costEur,
    score: Math.round(score),
    progressFraction: finished ? 1 : progressFraction,
    stars: !finished ? 0 : score < threshold ? 1 : core.damage > 0 ? 2 : 3,
    dnfReason: finished ? undefined : reason,
    why: finished ? undefined : 'Fake run: placeholder outcome until the sim lands.',
  };
}

function perceive(world: World, core: Core, rand: () => number): Perception {
  const { caps } = world;
  const index = indexAt(world, core.x);
  const segment = segmentOf(world, index);
  const next = world.mission.track.segments[index + 1];
  const toNext = world.starts[index]! + segment.lengthM - core.x;
  const noise = () => 1 + (rand() - 0.5) * 0.12;
  const drone = caps.sensors.has('scout_drone');
  const camera = drone || caps.sensors.has('camera');
  const seesNext = camera && next !== undefined && toNext <= (drone ? 15 : 6);
  const obstacleAt = segment.obstacle && !core.hit.has(index) ? world.starts[index]! + segment.lengthM / 2 - core.x : null;
  const nextObstacle = next?.obstacle ? toNext + next.lengthM / 2 : null;
  const obstacle = obstacleAt ?? nextObstacle;
  const wet = [segment, next].find((candidate) => candidate?.depthCm !== undefined);
  return {
    terrainAhead: camera ? (seesNext ? next.terrain : segment.terrain) : 'unknown',
    terrainAheadDistanceM: camera ? Math.max(0, toNext * noise()) : 'unknown',
    terrainAheadSource: camera ? (drone ? 'scout_drone' : 'camera') : undefined,
    obstacleAheadM: caps.sensors.has('ultrasonic')
      ? obstacle !== null && obstacle > 0 && obstacle <= 3
        ? obstacle * noise()
        : null
      : 'unknown',
    slipPct: caps.sensors.has('imu') ? clamp(core.slipPct * noise(), 0, 100) : 'unknown',
    tiltDeg: caps.sensors.has('imu') ? segment.slopeDeg + (rand() - 0.5) : 'unknown',
    depthAheadCm: caps.sensors.has('moisture') ? (wet?.depthCm ?? 0) * noise() : 'unknown',
  };
}

function optionsOf(caps: Caps): Action[] {
  const base: Action[] = ['cruise', 'accelerate', 'slow_down', 'brake', 'reverse', 'climb_mode'];
  return caps.winch ? [...base, 'deploy_winch'] : base;
}

function lookahead(world: World, core: Core, options: readonly Action[]): LookaheadEntry[] {
  return options.map((action) => {
    const probe: Core = { ...core, action, hit: new Set(core.hit), effects: [] };
    for (let i = 0; i < TUNING.decision.lookaheadS / DT; i += 1) stepCore(world, probe);
    return {
      action,
      progressM: probe.x - core.x,
      damagePct: Math.max(0, probe.damage - core.damage),
      energyPct: Math.max(0, core.battery - probe.battery),
    };
  });
}

function decide(question: BrainQuestion, policy: Policy, rand: () => number): Pick<BrainDecision, 'probabilities' | 'selected'> {
  const weights = question.options.map((action) => {
    if (policy === 'random') return rand() + 0.05;
    const entry = question.lookahead.find((candidate) => candidate.action === action);
    if (!entry) return 0.01;
    const utility =
      entry.progressM * (1.4 - question.priority) - entry.damagePct * (0.5 + question.priority * 1.5) - entry.energyPct * 0.4;
    return Math.exp(utility * (policy === 'jev' ? 2.6 : 2)) * (policy === 'jev' ? 0.85 + rand() * 0.3 : 1);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const probabilities = Object.fromEntries(question.options.map((action, i) => [action, weights[i]! / total]));
  const best = weights.indexOf(Math.max(...weights));
  return { probabilities, selected: question.options[best]! };
}

interface TriggerMemo {
  lastT: number;
  aheadFor: number;
  enteredFor: number;
  obstacleFor: number;
  slipAt: number;
}

function trigger(world: World, core: Core, memo: TriggerMemo): DecisionTrigger | null {
  const { caps } = world;
  const index = indexAt(world, core.x);
  const segment = segmentOf(world, index);
  const toNext = world.starts[index]! + segment.lengthM - core.x;
  if (memo.lastT < 0) return 'start';
  if (core.damageEvent > 0) return 'damage';
  const eyes = caps.sensors.has('camera') || caps.sensors.has('scout_drone');
  if (eyes && toNext <= (caps.sensors.has('scout_drone') ? 15 : 6) && memo.aheadFor < index && index + 1 < world.starts.length) {
    memo.aheadFor = index;
    return 'terrain_ahead';
  }
  if (!eyes && memo.enteredFor < index) {
    memo.enteredFor = index;
    return 'terrain_enter';
  }
  if (caps.sensors.has('ultrasonic') && segment.obstacle && !core.hit.has(index) && memo.obstacleFor < index) {
    if (world.starts[index]! + segment.lengthM / 2 - core.x <= 3) {
      memo.obstacleFor = index;
      return 'obstacle';
    }
  }
  if (caps.sensors.has('imu') && core.slipPct > TUNING.decision.slipThresholdPct && core.t - memo.slipAt > 1.2) {
    memo.slipAt = core.t;
    return 'slip';
  }
  return core.t - memo.lastT >= TUNING.decision.intervalS ? 'interval' : null;
}

const freshCore = (): Core => ({
  t: 0, x: 0, v: 0, battery: 100, damage: 0, action: 'cruise', slipPct: 0, stuckS: 0, wheelSpin: 0,
  effects: [], hit: new Set(), damageEvent: 0,
});

const freshMemo = (): TriggerMemo => ({ lastT: -1, aheadFor: -1, enteredFor: -1, obstacleFor: -1, slipAt: -9 });

function questionOf(world: World, core: Core, why: DecisionTrigger, priority: number, rand: () => number): BrainQuestion {
  const options = optionsOf(world.caps);
  return {
    missionId: world.mission.id,
    t: core.t,
    trigger: why,
    perceived: perceive(world, core, rand),
    status: { speedMps: core.v, batteryPct: core.battery, damagePct: core.damage },
    priority,
    options,
    lookahead: lookahead(world, core, options),
  };
}

/** Instant headless fake run for a ghost lane. */
export function fakeGhostTrace(mission: Mission, build: Build, policy: Policy, seed = 1): GhostTrace {
  const world = worldOf(mission, build);
  const rand = mulberry32(seed + (policy === 'random' ? 7919 : 104729));
  const core = freshCore();
  const memo = freshMemo();
  const frames: SimState[] = [simStateOf(world, core)];
  const every = Math.round(1 / (TUNING.ghostHz * DT));
  let reason = endReason(world, core);
  for (let i = 1; reason === null; i += 1) {
    const why = trigger(world, core, memo);
    if (why) {
      memo.lastT = core.t;
      core.action = decide(questionOf(world, core, why, 0.5, rand), policy, rand).selected;
    }
    stepCore(world, core);
    if (i % every === 0) frames.push(simStateOf(world, core));
    reason = endReason(world, core);
  }
  frames.push(simStateOf(world, core));
  return { policy, frames, outcome: outcomeOf(world, core, reason) };
}

export interface FakeRunOptions {
  readonly mission: Mission;
  readonly build: Build;
  readonly onEvent: (event: RunEvent) => void;
  readonly seed?: number;
  /** 0 = speed, 1 = safety. */
  readonly priority?: number;
}

export interface FakeRun {
  readonly start: () => void;
  readonly stop: () => void;
}

/** Wall-clock fake run with pending decisions, slow-mo, latency and the odd fallback. */
export function createFakeRun({ mission, build, onEvent, seed = 1, priority = 0.5 }: FakeRunOptions): FakeRun {
  const world = worldOf(mission, build);
  const rand = mulberry32(seed);
  const core = freshCore();
  const memo = freshMemo();
  let raf = 0;
  let last = 0;
  let budget = 0;
  let pendingUntil = 0;
  let pending: { question: BrainQuestion; latencyMs: number } | null = null;
  let stopped = false;

  const resolve = () => {
    if (!pending) return;
    const { question, latencyMs } = pending;
    pending = null;
    const fallback = latencyMs >= TUNING.decision.timeoutMs;
    const policy: Policy = fallback ? 'heuristic' : 'jev';
    const picked = decide(question, policy, rand);
    core.action = picked.selected;
    const decision: BrainDecision = { ...picked, policy, fallback, latencyMs, model: fallback ? undefined : 'jev-fake' };
    onEvent({ type: 'decision', t: core.t, question, decision });
  };

  const tick = (time: number) => {
    if (stopped) return;
    const dtWall = Math.min(0.1, (time - last) / 1000);
    last = time;
    if (pending && time >= pendingUntil) resolve();
    budget += dtWall * (pending ? TUNING.decision.slowMoFactor : 1);
    while (budget >= DT) {
      budget -= DT;
      const why = pending ? null : trigger(world, core, memo);
      if (why) {
        memo.lastT = core.t;
        const question = questionOf(world, core, why, priority, rand);
        const latencyMs = rand() < 0.12 ? TUNING.decision.timeoutMs : Math.round(180 + rand() * 620);
        pending = { question, latencyMs };
        pendingUntil = time + latencyMs;
        onEvent({ type: 'decisionPending', t: core.t, question });
      }
      const before = indexAt(world, core.x);
      stepCore(world, core);
      onEvent({ type: 'frame', state: simStateOf(world, core) });
      const after = indexAt(world, core.x);
      if (after !== before) onEvent({ type: 'terrainEnter', t: core.t, terrain: segmentOf(world, after).terrain, segmentIndex: after });
      if (core.damageEvent > 0) {
        onEvent({ type: 'damage', t: core.t, cause: 'impact', amountPct: core.damageEvent, totalPct: core.damage });
      }
      const reason = endReason(world, core);
      if (reason) {
        resolve();
        const outcome = outcomeOf(world, core, reason);
        onEvent(reason === 'finish' ? { type: 'finish', t: core.t, outcome } : { type: 'dnf', t: core.t, reason, outcome });
        stopped = true;
        return;
      }
    }
    raf = requestAnimationFrame(tick);
  };

  return {
    start: () => {
      stopped = false;
      last = performance.now();
      onEvent({ type: 'frame', state: simStateOf(world, core) });
      raf = requestAnimationFrame(tick);
    },
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
}
