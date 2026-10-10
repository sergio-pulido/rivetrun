// @rivetrun/brain — server-only Jev client. Never import from client components:
// it reads JEV_API_KEY. Request/response shape: docs/JEV.md.
// Type-only imports and erasable syntax only: scripts/jev-smoke.ts runs this file with node type stripping.
import type {
  Action,
  Brain,
  BrainDecision,
  BrainQuestion,
  LookaheadEntry,
  Observation,
  Probabilities,
} from '@rivetrun/contracts';

/** Versioned id (not the `jev-latest` alias) so behaviour does not move under us. See docs/JEV.md. */
export const JEV_MODEL_ID = 'jev-1.13.0';
export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_TIMEOUT_MS = 1200;
/**
 * Version of the question wording below. Bump it whenever buildJevRequest changes what Jev is told:
 * every cache of Jev answers (decisions, ghosts) keys on it, so an old answer is never served for a new question.
 */
export const JEV_QUESTION_VERSION = 'q7-observation';
const QUESTION_ID = 'action';

export interface JevBrainOptions {
  /** Defaults to process.env.JEV_API_KEY. */
  readonly apiKey?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

export type JevErrorCode = 'missing_key' | 'timeout' | 'http' | 'network' | 'bad_response';

export class JevError extends Error {
  readonly code: JevErrorCode;
  readonly status?: number;
  constructor(code: JevErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'JevError';
    this.code = code;
    this.status = status;
  }
}

export interface JevRequest {
  readonly model: string;
  /** Brain v3: built from the Observation only. Older questions without one send `perceived` + `robot`. */
  readonly state: Readonly<Record<string, unknown>>;
  readonly questions: {
    readonly action: {
      readonly type: 'choice';
      readonly instructions: string;
      readonly criteria: Readonly<Record<string, string | null>>;
    };
  };
}

const assertServer = (): void => {
  if ('window' in globalThis) {
    throw new Error('@rivetrun/brain is server-only: it must never run in the browser');
  }
};

const ACTION_MEANING: Readonly<Record<Action, string>> = {
  accelerate: 'Full throttle.',
  cruise: 'Steady throttle: keep driving at the current pace.',
  slow_down: 'Ease off: keep driving forward, slower and more carefully.',
  coast: 'No drive: roll on without power and lose speed gradually (saves energy).',
  brake_soft: 'Gentle brake: slow down without stopping dead.',
  brake: 'Hard brake: stop and wait. The robot does not advance.',
  reverse: 'Drive backwards, away from the finish.',
  climb_mode: 'Keep driving forward in low gear with high torque (slopes, steps, rough ground).',
  deploy_winch: 'Pull the robot forward with the winch (when wheels slip or the robot is bogged down).',
  jump: 'Fire the piston: the robot hops into the air while it keeps its forward speed (clears a gap or a low obstacle; no traction and no braking until it lands).',
  scan: 'Stop on the scan zone under the robot and scan it.',
};

const STOPPED_SPEED_MPS = 0.1;
// Mirrors BRIEFING_MAX_CHARS in @rivetrun/contracts (type-only imports here: see the header).
const BRIEFING_MAX_CHARS = 140;
const STALL_PROGRESS_M = 0.15;
const DEFAULT_LOOKAHEAD_S = 1.5;

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

// Jev reads named buckets better than raw numbers (docs/JEV.md, jaggedness), so every number gets one.
const damageBucket = (pct: number): string =>
  pct < 1 ? 'negligible' : pct < 4 ? 'light' : pct < 12 ? 'moderate' : 'heavy';
// Energy and stall thresholds are per default lookahead window; a longer window (Scout Drone) scales them.
const energyBucket = (pct: number, scale: number): string => (pct < 0.5 * scale ? 'low' : pct < 1.5 * scale ? 'medium' : 'high');
const progressBucket = (m: number, best: number, scale: number): string => {
  if (m < 0) return 'backwards, loses ground';
  if (m < STALL_PROGRESS_M * scale) return 'none, the robot stays where it is';
  if (best <= 0) return 'some';
  const share = m / best;
  return share >= 0.9 ? 'most' : share >= 0.6 ? 'good' : share >= 0.3 ? 'some' : 'little';
};

/** The exact rule Jev applies, stated literally (docs/JEV.md: literal reading). */
const priorityRule = (priority: number): string => {
  const value = round(priority, 2);
  if (priority <= 0.25) {
    return `The player priority is ${value} on a scale from 0 (pure speed) to 1 (pure safety): SPEED. Pick the option with the most progress unless its damage is heavy.`;
  }
  if (priority < 0.75) {
    return `The player priority is ${value} on a scale from 0 (pure speed) to 1 (pure safety): BALANCED. Pick the option with the most progress among those with negligible or light damage.`;
  }
  return `The player priority is ${value} on a scale from 0 (pure speed) to 1 (pure safety): SAFETY. Pick the option with the most progress among those with negligible damage; if none has negligible damage, pick the one with the least damage that still moves forward.`;
};

/** A hazard the sensors see further away than any option travels in the simulated window (long-range rangers). */
interface FarHazard {
  readonly kind: 'obstacle' | 'gap';
  readonly distanceM: number;
}

/** How soon the robot arrives at a far hazard if it keeps the pace an option ends the window with. */
const arrivalBucket = (seconds: number): string => (seconds < 1.5 ? 'immediately' : seconds < 4 ? 'soon' : seconds < 8 ? 'later' : 'far off');

/**
 * The lookahead only simulates `lookaheadS` seconds, so a hazard seen beyond that reach is in none of the
 * predicted damage figures. This line gives Jev the facts the simulation left out, per option: how much
 * distance is left after the window and how soon the robot gets there at that option's pace.
 */
function farHazardLine(hazard: FarHazard | null, entry: LookaheadEntry, lookaheadS: number): string {
  if (!hazard) return '';
  const leftM = hazard.distanceM - entry.progressM;
  if (leftM <= 0) return '';
  const paceMps = entry.progressM / lookaheadS;
  if (paceMps <= 0.05) return ` The ${hazard.kind} stays ${round(leftM, 1)} m ahead: this option does not approach it.`;
  const arrivalS = leftM / paceMps;
  return ` The ${hazard.kind} is then ${round(leftM, 1)} m ahead, reached in about ${round(arrivalS, 1)} s at this pace (${arrivalBucket(arrivalS)}).`;
}

/** The nearest hazard that no option reaches inside the simulated window, or null. */
function findFarHazard(question: BrainQuestion): FarHazard | null {
  const reach = Math.max(0, ...question.lookahead.map((entry) => entry.progressM));
  // Brain v3: the Observation is the only source. Older questions carry the same readings in `perceived`.
  const seenHazard = question.observation?.hazard;
  const seenGap = question.observation?.gap;
  const obstacleAheadM = question.observation ? (seenHazard && seenHazard !== 'unknown' ? seenHazard.distanceM : null) : question.perceived.obstacleAheadM;
  const gapAheadM = question.observation ? (seenGap && seenGap !== 'unknown' ? seenGap.distanceM : null) : question.perceived.gapAheadM;
  const seen: FarHazard[] = [];
  if (typeof obstacleAheadM === 'number' && obstacleAheadM > reach) seen.push({ kind: 'obstacle', distanceM: obstacleAheadM });
  if (typeof gapAheadM === 'number' && gapAheadM > reach) seen.push({ kind: 'gap', distanceM: gapAheadM });
  return seen.sort((a, b) => a.distanceM - b.distanceM)[0] ?? null;
}

/** Charge left at the finish, as the question words it for the robot now and for every option. */
const finishChargeLevel = (pct: number): string =>
  pct < 0 ? 'runs out before the finish' : pct < 10 ? 'critical' : pct < 30 ? 'tight' : 'comfortable';

/** The per-option half of the energy line: where the battery ends up if this option's pace holds to the finish. */
const finishChargeLine = (entry: LookaheadEntry): string =>
  entry.projectedFinishPct === undefined
    ? ''
    : ` Charge at the finish if this pace holds: ${round(entry.projectedFinishPct, 0)} % (${finishChargeLevel(entry.projectedFinishPct)}).`;

const describeOption = (
  action: Action,
  entry: LookaheadEntry | undefined,
  bestProgress: number,
  lookaheadS: number,
  hazard: FarHazard | null,
): string => {
  if (!entry) return `${ACTION_MEANING[action]} No prediction available.`;
  const progress = round(entry.progressM, 1);
  const damage = round(entry.damagePct, 1);
  const energy = round(entry.energyPct, 2);
  const scale = lookaheadS / DEFAULT_LOOKAHEAD_S;
  return (
    `${ACTION_MEANING[action]} Predicted over the next ${lookaheadS} s: ` +
    `progress ${progress} m (${progressBucket(entry.progressM, bestProgress, scale)}), ` +
    `damage +${damage} % (${damageBucket(entry.damagePct)}), ` +
    `energy ${energy} % (${energyBucket(entry.energyPct, scale)}).` +
    finishChargeLine(entry) +
    (entry.assumed ? ' This prediction runs past what the sensors know: it assumes the track continues unchanged.' : '') +
    farHazardLine(hazard, entry, lookaheadS)
  );
};

/** Briefing as one quotable line: no quotes, backticks or line breaks that could break out of the sentence. */
const cleanBriefing = (briefing: string | undefined): string =>
  (briefing ?? '').replace(/["`\\]/g, "'").replace(/\s+/g, ' ').trim().slice(0, BRIEFING_MAX_CHARS);

/** Readings the question forwards from the Observation: each a value, null (sensor fitted, nothing in range) or "unknown". */
const READING_KEYS = ['hazard', 'gap', 'terrainAhead', 'waterDepthCm', 'tiltDeg', 'slipPct', 'slipping', 'lastContact'] as const;

/**
 * Brain v3 state: only what the Observation holds. Nothing here is read from the track or from `perceived`.
 * Scan zones already behind the robot or done are left out to keep the state small.
 */
function observationState(observation: Observation, cause: string | undefined): Readonly<Record<string, unknown>> {
  const readings = Object.fromEntries(READING_KEYS.map((key) => [key, observation[key]]));
  return {
    robot: {
      speedMps: round(observation.speedMps, 2),
      damagePct: round(observation.damagePct, 1),
      motion: Math.abs(observation.speedMps) < STOPPED_SPEED_MPS ? 'stopped' : 'moving',
    },
    energy: {
      batteryPct: round(observation.batteryPct, 1),
      drawW: round(observation.drawW, 1),
      projectedFinishPct: round(observation.projectedFinishPct, 0),
      level: finishChargeLevel(observation.projectedFinishPct),
    },
    mission: {
      lengthM: round(observation.missionLengthM, 1),
      doneM: round(observation.odometerM, 1),
      remainingM: round(observation.remainingM, 1),
      scanZones: observation.scanZones
        .filter((zone) => !zone.done && !zone.missed)
        .map((zone) => ({ label: zone.label, distanceM: round(zone.distanceM, 1), canScan: zone.canScan })),
    },
    sensors: observation.lines,
    readings,
    unknown: observation.unknown,
    forwardRangeM: observation.forwardRangeM,
    actuators: observation.actuators,
    ...(cause ? { askedBecause: cause } : {}),
  };
}

/** A zone counts as under the robot within this distance of its centre. */
const ZONE_UNDER_M = 1;

/**
 * Scanning is a mission objective, not progress, so the rule is stated as a fact computed here rather than
 * left for Jev to infer from distances (docs/JEV.md: literal reading).
 */
function scanLine(question: BrainQuestion, observation: Observation): string {
  if (!question.options.includes('scan')) return '';
  const under = observation.scanZones.find((zone) => zone.canScan && !zone.done && !zone.missed && Math.abs(zone.distanceM) <= ZONE_UNDER_M);
  return under
    ? `The scan zone "${under.label.replace(/["`]/g, "'")}" is under the robot right now and this robot can scan it. Scanning zones is a mission objective and a zone driven past is lost for good, so \`scan\` is the correct option here unless the briefing forbids stopping; this overrides the rule about options with no progress. `
    : 'No scannable zone is under the robot right now, so `scan` is not correct yet. ';
}

/** The sentences only a v3 question has: why it is asked, what is unknown, the energy line, scanning. */
function observationLines(question: BrainQuestion, observation: Observation): string {
  const cause = question.cause?.label;
  const unknown = observation.unknown.length > 0 ? observation.unknown.join('; ') : null;
  const charge = round(observation.projectedFinishPct, 0);
  return (
    (cause ? `This decision is requested because something changed: ${cause}. ` : '') +
    'There is no clock: the chosen command stays in force until the next change, which may be a long way off, so choose what should hold until then. ' +
    'The robot knows only what its own sensors report (`sensors`, `readings`). ' +
    (observation.blind ? 'It has NO forward sensor: it cannot see obstacles or gaps and only learns of them by hitting them. ' : `Its forward sensors reach ${round(observation.forwardRangeM, 1)} m. `) +
    (unknown ? `Unknown to this robot, so no prediction accounts for it: ${unknown}. ` : '') +
    'Where a prediction says it runs past what the sensors know, treat it as a guess that the track continues unchanged. ' +
    `Energy: the battery is at ${round(observation.batteryPct, 0)} %, drawing ${round(observation.drawW, 0)} W; at the current pace the charge at the finish would be ${charge} % (${finishChargeLevel(observation.projectedFinishPct)}), with ${round(observation.remainingM, 0)} m to go. ` +
    'Each option states the charge at the finish if its pace holds. An option that runs out before the finish loses the race: when the fast options run out or are critical, pick the fastest option that still finishes with charge left. ' +
    scanLine(question, observation)
  );
}

/** BrainQuestion → the documented System One request with one Choice question. */
export function buildJevRequest(question: BrainQuestion, model: string = JEV_MODEL_ID): JevRequest {
  const observation = question.observation;
  // The sim simulates further ahead with a Scout Drone fitted; absent = the default window.
  const lookaheadS = question.lookaheadS ?? DEFAULT_LOOKAHEAD_S;
  const byAction = new Map(question.lookahead.map((entry) => [entry.action, entry]));
  const bestProgress = Math.max(0, ...question.lookahead.map((entry) => entry.progressM));
  // Long-range rangers (ToF 4 m, lidar 12 m) see hazards the 1.5 s simulation never reaches.
  const hazard = findFarHazard(question);
  const hazardLine = hazard
    ? `The sensors see ${hazard.kind === 'gap' ? 'a gap' : 'an obstacle'} ${round(hazard.distanceM, 1)} m ahead, further than any option travels in the simulated window, so hitting it is NOT in any predicted damage figure. Each option says how far away it then is and how soon the robot reaches it. Arriving "immediately" or "soon" at speed risks an impact, more so on slippery ground (ice, mud, a high slip reading) where the robot needs longer to slow down; "later" or "far off" leaves room to keep the pace for now. `
    : '';
  const criteria = Object.fromEntries(
    question.options.map((action) => [action, describeOption(action, byAction.get(action), bestProgress, lookaheadS, hazard)]),
  );
  const stopped = Math.abs((observation?.speedMps ?? question.status.speedMps)) < STOPPED_SPEED_MPS;
  // Only builds with the piston are offered `jump`; say when it is worth its energy.
  const jumpLine = question.options.includes('jump')
    ? '`jump` is only correct when its predicted progress is higher or its predicted damage is lower than every other forward option (a gap or a low obstacle directly ahead); on open ground it wastes energy. '
    : '';
  const briefing = cleanBriefing(question.briefing);
  const briefingLine = briefing
    ? `The player gave the driver these instructions: "${briefing}" These instructions outrank the priority rule below: among the options that move forward, choose the one that best fits the instructions, even when the rule would pick a faster or a slower one. `
    : '';
  return {
    model,
    state: observation
      ? observationState(observation, question.cause?.label)
      : { perceived: question.perceived, robot: { ...question.status, motion: stopped ? 'stopped' : 'moving' } },
    questions: {
      [QUESTION_ID]: {
        type: 'choice',
        instructions:
          'A robot is racing along a track and must reach the finish line; a robot that stops or goes backwards never finishes and loses the race. ' +
          'Which driving action should it take now? ' +
          `Each option states its predicted progress, damage and energy from a ${lookaheadS} second forward simulation of that action, each with a named level in brackets. ` +
          'Damage is cumulative and the robot is only destroyed at 100 %, so negligible damage is acceptable. ' +
          briefingLine +
          `${priorityRule(question.priority)} ` +
          'Options with no progress or backwards progress are only correct when every forward option has heavy damage. ' +
          jumpLine +
          hazardLine +
          (observation
            ? observationLines(question, observation) +
              'In `readings`, "unknown" means the robot has no sensor for it and null means a sensor is fitted and reports nothing in range.'
            : '`perceived` holds the sensor readings ("unknown" means no sensor for that reading); `robot` is the current speed, battery, damage and motion.'),
        criteria,
      },
    },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Documented Choice answer → probabilities over our options (renormalised) + selected action. */
export function parseJevResponse(
  body: unknown,
  options: readonly Action[],
): { probabilities: Probabilities; selected: Action; model?: string } {
  const answer = isRecord(body) && isRecord(body.answers) ? body.answers[QUESTION_ID] : undefined;
  if (!isRecord(answer) || !isRecord(answer.probabilities)) {
    throw new JevError('bad_response', 'Jev response has no answers.action.probabilities');
  }
  const raw = answer.probabilities;
  const values = options.map((action) => {
    const p = raw[action];
    return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : 0;
  });
  const total = values.reduce((sum, p) => sum + p, 0);
  if (total <= 0) throw new JevError('bad_response', 'Jev returned no probability mass for the available actions');
  const probabilities: Probabilities = Object.fromEntries(
    options.map((action, i) => [action, Math.min(1, (values[i] ?? 0) / total)]),
  );
  const argmax = options.reduce((best, action) =>
    (probabilities[action] ?? 0) > (probabilities[best] ?? 0) ? action : best,
  );
  const choice = options.find((action) => action === answer.choice);
  return {
    probabilities,
    selected: choice ?? argmax,
    model: isRecord(body) && typeof body.model === 'string' ? body.model : undefined,
  };
}

/** One Jev call per decision. Throws JevError on any failure; the caller owns the fallback. */
export function createJevBrain(options: JevBrainOptions = {}): Brain {
  assertServer();
  const model = options.model ?? JEV_MODEL_ID;
  const timeoutMs = options.timeoutMs ?? JEV_TIMEOUT_MS;
  const doFetch = options.fetch ?? fetch;

  const ask = async (question: BrainQuestion, controller: AbortController): Promise<BrainDecision> => {
    const apiKey = options.apiKey ?? process.env.JEV_API_KEY;
    if (!apiKey) throw new JevError('missing_key', 'JEV_API_KEY is not set');

    const started = performance.now();
    try {
      const response = await doFetch(JEV_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildJevRequest(question, model)),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 300);
        throw new JevError('http', `Jev responded ${response.status}: ${detail}`, response.status);
      }
      const parsed = parseJevResponse(await response.json(), question.options);
      return {
        probabilities: parsed.probabilities,
        selected: parsed.selected,
        policy: 'jev',
        fallback: false,
        latencyMs: Math.round(performance.now() - started),
        model: parsed.model ?? model,
      };
    } catch (error) {
      if (error instanceof JevError) throw error;
      if (controller.signal.aborted) throw new JevError('timeout', `Jev exceeded ${timeoutMs} ms`);
      throw new JevError('network', error instanceof Error ? error.message : String(error));
    }
  };

  // The deadline is enforced twice: the abort signal cancels the request, and the race guarantees that
  // decide() settles even if an aborted body read never does (seen as a hung run in the benchmark).
  const decide = (question: BrainQuestion): Promise<BrainDecision> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new JevError('timeout', `Jev exceeded ${timeoutMs} ms`));
      }, timeoutMs);
    });
    const answer = ask(question, controller);
    // A late rejection of the losing promise must not surface as unhandled.
    answer.catch(() => undefined);
    return Promise.race([answer, deadline]).finally(() => clearTimeout(timer));
  };

  return { decide };
}
