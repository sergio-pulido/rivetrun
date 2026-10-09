// @rivetrun/brain — server-only Jev client. Never import from client components:
// it reads JEV_API_KEY. Request/response shape: docs/JEV.md.
// Type-only imports and erasable syntax only: scripts/jev-smoke.ts runs this file with node type stripping.
import type {
  Action,
  Brain,
  BrainDecision,
  BrainQuestion,
  LookaheadEntry,
  Perception,
  Probabilities,
} from '@rivetrun/contracts';

/** Versioned id (not the `jev-latest` alias) so behaviour does not move under us. See docs/JEV.md. */
export const JEV_MODEL_ID = 'jev-1.13.0';
export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_TIMEOUT_MS = 1200;
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
  readonly state: {
    readonly perceived: Perception;
    readonly robot: BrainQuestion['status'];
  };
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
  cruise: 'Hold the current speed.',
  accelerate: 'Speed up.',
  slow_down: 'Reduce speed.',
  brake: 'Stop.',
  reverse: 'Back up.',
  climb_mode: 'Low gear, high torque for slopes and steps.',
  deploy_winch: 'Pull the robot forward with the winch.',
};

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

// Jev reads named buckets better than raw numbers (docs/JEV.md, jaggedness), so every number gets one.
const damageBucket = (pct: number): string => (pct <= 0 ? 'none' : pct < 3 ? 'light' : pct < 10 ? 'moderate' : 'heavy');
const energyBucket = (pct: number): string => (pct < 0.5 ? 'low' : pct < 1.5 ? 'medium' : 'high');
const progressBucket = (m: number, best: number): string => {
  if (m <= 0) return m < 0 ? 'backwards' : 'none';
  if (best <= 0) return 'some';
  const share = m / best;
  return share >= 0.9 ? 'best' : share >= 0.5 ? 'good' : 'little';
};

const priorityText = (priority: number): string => {
  const label =
    priority <= 0.2
      ? 'pure speed: maximise progress, accept damage and energy use'
      : priority < 0.4
        ? 'mostly speed: prefer progress, avoid only heavy damage'
        : priority <= 0.6
          ? 'balanced: trade progress against damage evenly'
          : priority < 0.8
            ? 'mostly safety: avoid damage, accept slower progress'
            : 'pure safety: minimise damage first, progress second';
  return `${round(priority, 2)} on a scale from 0 (pure speed) to 1 (pure safety), i.e. ${label}`;
};

const describeOption = (action: Action, entry: LookaheadEntry | undefined, bestProgress: number): string => {
  if (!entry) return `${ACTION_MEANING[action]} No prediction available.`;
  const progress = round(entry.progressM, 1);
  const damage = round(entry.damagePct, 1);
  const energy = round(entry.energyPct, 2);
  return (
    `${ACTION_MEANING[action]} Predicted over the next 1.5 s: ` +
    `progress ${progress} m (${progressBucket(entry.progressM, bestProgress)}), ` +
    `damage +${damage} % (${damageBucket(entry.damagePct)}), ` +
    `energy ${energy} % (${energyBucket(entry.energyPct)}).`
  );
};

/** BrainQuestion → the documented System One request with one Choice question. */
export function buildJevRequest(question: BrainQuestion, model: string = JEV_MODEL_ID): JevRequest {
  const byAction = new Map(question.lookahead.map((entry) => [entry.action, entry]));
  const bestProgress = Math.max(0, ...question.lookahead.map((entry) => entry.progressM));
  const criteria = Object.fromEntries(
    question.options.map((action) => [action, describeOption(action, byAction.get(action), bestProgress)]),
  );
  return {
    model,
    state: { perceived: question.perceived, robot: question.status },
    questions: {
      [QUESTION_ID]: {
        type: 'choice',
        instructions:
          'Which driving action should the robot take for the next 1.5 seconds? ' +
          `The player priority is ${priorityText(question.priority)}. ` +
          'Each option states its predicted outcome from a forward simulation on the sensor readings in `perceived`; ' +
          'a reading of "unknown" means the robot has no sensor for it, so the prediction may miss that hazard. ' +
          '`robot` is the current speed, battery and damage. Pick the option that best serves the player priority.',
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

  const decide = async (question: BrainQuestion): Promise<BrainDecision> => {
    const apiKey = options.apiKey ?? process.env.JEV_API_KEY;
    if (!apiKey) throw new JevError('missing_key', 'JEV_API_KEY is not set');

    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    } finally {
      clearTimeout(timer);
    }
  };

  return { decide };
}
