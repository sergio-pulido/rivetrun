// Brain Arena (docs/BRAIN_ARENA.md, RR-ARENA): one question for every contestant.
// The text below is rendered from the same request Jev receives (buildJevRequest), so an LLM reads exactly
// the state, the instructions and the option descriptions Jev is given, and nothing else.
import { createHash } from 'node:crypto';
import type { Action, BrainQuestion } from '@rivetrun/contracts';
import { buildJevRequest, JEV_QUESTION_VERSION, type QuestionMode } from '../index';

export const ARENA_SYSTEM =
  'You are the driver of a small robot in a racing simulation. You are asked one multiple-choice question at a time. ' +
  'Answer with a single JSON object and nothing else: {"choice": "<one of the option names>", "confidence": <number from 0 to 1>}. ' +
  'No explanation, no code fence, no other keys.';

/** JSON Schema of the answer, for providers that accept one. */
export const ARENA_ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['choice', 'confidence'],
  properties: {
    choice: { type: 'string', description: 'The name of the chosen option, exactly as listed.' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

// Which wording a whole arena invocation asks (docs/QA.md Q20). Set once by the runner before any contestant is
// built; a script-level switch, never changed while runs are in flight.
let arenaMode: QuestionMode = 'verdict';
export const setArenaQuestionMode = (mode: QuestionMode): void => {
  arenaMode = mode;
};
export const arenaQuestionMode = (): QuestionMode => arenaMode;

export interface ArenaPrompt {
  readonly system: string;
  readonly user: string;
  readonly options: readonly Action[];
}

/** The question as plain text: state, instructions, then one line per option. */
export function buildArenaPrompt(question: BrainQuestion, mode: QuestionMode = arenaMode): ArenaPrompt {
  const request = buildJevRequest(question, undefined, mode);
  const { instructions, criteria } = request.questions.action;
  const options = question.options.map((action) => `- ${action}: ${criteria[action] ?? ''}`).join('\n');
  const user = [
    'STATE (JSON):',
    JSON.stringify(request.state),
    '',
    'QUESTION:',
    instructions,
    '',
    'OPTIONS:',
    options,
    '',
    `Reply with JSON only: {"choice": one of [${question.options.join(', ')}], "confidence": 0..1}`,
  ].join('\n');
  return { system: ARENA_SYSTEM, user, options: question.options };
}

export interface ArenaAnswer {
  readonly choice: Action;
  readonly confidence: number;
}

/** Reads {choice, confidence} out of a model's reply. Throws when the choice is not one of the options. */
export function parseArenaAnswer(text: string, options: readonly Action[]): ArenaAnswer {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('the reply holds no JSON object');
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  const record = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const choice = options.find((action) => action === record.choice);
  if (!choice) throw new Error('the reply does not choose one of the options');
  const confidence = typeof record.confidence === 'number' && Number.isFinite(record.confidence) ? Math.min(1, Math.max(0, record.confidence)) : 0;
  return { choice, confidence };
}

/** A fixed question, only used to fingerprint the prompt template. */
const HASH_FIXTURE: BrainQuestion = {
  missionId: 'M1',
  t: 0,
  trigger: 'start',
  perceived: { terrainAhead: 'asphalt', terrainAheadDistanceM: 5, obstacleAheadM: null, slipPct: 'unknown', tiltDeg: 'unknown', depthAheadCm: 'unknown' },
  status: { speedMps: 0, batteryPct: 100, damagePct: 0 },
  priority: 0.5,
  options: ['cruise', 'accelerate', 'brake'],
  lookahead: [
    { action: 'cruise', progressM: 1, damagePct: 0, energyPct: 0.2 },
    { action: 'accelerate', progressM: 2, damagePct: 0, energyPct: 0.3 },
    { action: 'brake', progressM: 0, damagePct: 0, energyPct: 0.1 },
  ],
};

/** Short hash of the prompt template: changes whenever the wording any contestant reads changes. */
export function arenaPromptHash(mode: QuestionMode = arenaMode): string {
  const prompt = buildArenaPrompt(HASH_FIXTURE, mode);
  return createHash('sha256').update(`${JEV_QUESTION_VERSION}${mode === 'facts' ? '-facts' : ''}\n${prompt.system}\n${prompt.user}`).digest('hex').slice(0, 10);
}
