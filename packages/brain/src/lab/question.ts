// Lab Missions (docs/OVERNIGHT.md, Wave 2): the question a brain gets for a grid decision.
// Built only from the LabQuestion the lab sim hands over (its Observation lines, objectives, energy and named
// options). Jev gets it as a Choice over the option ids; LLMs get the same text and answer {choice, confidence}.
// The shapes below are structural, so this file needs nothing from @rivetrun/lab at run time.
import { JEV_MODEL_ID, type JevRequest } from '../index';

export interface LabOptionLike {
  readonly id: string;
  readonly kind: 'interact' | 'objective' | 'return' | 'explore' | 'wait' | 'pace';
  readonly label: string;
  readonly description: string;
  readonly predicted?: {
    readonly steps?: number;
    readonly timeS?: number;
    readonly energyPct?: number;
    readonly batteryAfterPct?: number;
    readonly marginAfterPct?: number;
    readonly assumed?: boolean;
    readonly risk?: string;
  };
  readonly completes?: boolean;
  readonly towardTiles?: number;
  readonly visited?: boolean;
  readonly current?: boolean;
}

export interface LabQuestionLike {
  readonly scenarioId: string;
  readonly objective: string;
  readonly t: number;
  readonly trigger: { readonly label: string };
  readonly knew: readonly string[];
  readonly unknown: readonly string[];
  readonly energy: { readonly batteryPct: number; readonly projectedPct?: number; readonly rangeTiles: number };
  readonly objectives: readonly { readonly id: string; readonly label: string; readonly done: boolean; readonly have: number; readonly need: number }[];
  readonly options: readonly LabOptionLike[];
  readonly observation: { readonly blind: boolean; readonly exploredPct: number; readonly carrying: readonly string[]; readonly damagePct: number; readonly pace: string };
  readonly briefing?: string;
}

/** Version of the Lab question wording; part of the arena's Lab prompt hash. */
export const LAB_QUESTION_VERSION = 'lab-q1';

const round = (value: number, digits = 0): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Charge left once the robot is back at the end point, as a named level (the same words as on the rail). */
const marginLevel = (pct: number): string => (pct < 0 ? 'would not get back' : pct < 10 ? 'critical' : pct < 30 ? 'tight' : 'comfortable');

const KIND_NOTE: Readonly<Record<LabOptionLike['kind'], string>> = {
  interact: 'Act on the tile the robot is on.',
  objective: 'Drive to a known objective and do it.',
  return: 'Drive to the mission end point.',
  explore: 'Drive into ground the robot has not sensed yet.',
  wait: 'Stay where it is for a moment.',
  pace: 'Change the driving pace; the robot keeps doing what it is doing.',
};

function describeOption(option: LabOptionLike): string {
  const p = option.predicted;
  const parts = [`${option.label}. ${KIND_NOTE[option.kind]} ${option.description}`.trim()];
  if (option.kind === 'return') parts.push(option.completes ? 'Arriving completes the mission.' : 'Arriving ends the mission early, with objectives still open.');
  if (p) {
    const predicted = [
      p.steps !== undefined ? `${p.steps} tiles` : null,
      p.timeS !== undefined ? `${round(p.timeS)} s` : null,
      p.energyPct !== undefined ? `costs ${round(p.energyPct, 1)} % charge` : null,
      p.batteryAfterPct !== undefined ? `battery then ${round(p.batteryAfterPct)} %` : null,
      p.marginAfterPct !== undefined ? `charge left after driving on to the end point ${round(p.marginAfterPct)} % (${marginLevel(p.marginAfterPct)})` : null,
    ].filter((part): part is string => part !== null);
    if (predicted.length > 0) parts.push(`Predicted: ${predicted.join(', ')}.`);
    if (p.assumed) parts.push('The way crosses ground the robot has not seen: the usual ground was assumed.');
    if (p.risk) parts.push(`Risk: ${p.risk}.`);
  }
  if (option.towardTiles !== undefined) parts.push(`That edge of the map is ${option.towardTiles} tiles from the nearest thing the robot still wants.`);
  if (option.visited) parts.push('The first tile that way has been driven before.');
  if (option.current) parts.push('The robot is already doing this.');
  return parts.join(' ');
}

/** Briefing as one quotable line (same cleaning as the rail question). */
const cleanBriefing = (briefing: string | undefined): string => (briefing ?? '').replace(/["`\\]/g, "'").replace(/\s+/g, ' ').trim().slice(0, 140);

export interface LabPromptParts {
  readonly state: Readonly<Record<string, unknown>>;
  readonly instructions: string;
  /** Option id → what choosing it means and what the sim predicts for it. */
  readonly criteria: Readonly<Record<string, string>>;
  readonly optionIds: readonly string[];
}

/** The Lab question in the three parts every contestant gets. */
export function buildLabPromptParts(question: LabQuestionLike): LabPromptParts {
  const open = question.objectives.filter((objective) => !objective.done);
  const briefing = cleanBriefing(question.briefing);
  const projected = question.energy.projectedPct;
  const instructions =
    `A small robot is on a mission in a grid world it has to discover with its own sensors. Mission: ${question.objective} ` +
    'Which of the listed moves should it make now? ' +
    `This decision is requested because something changed: ${question.trigger.label}. There is no clock: the chosen move stays in force until the next change. ` +
    'The robot knows only what its sensors have reported (`sensors`); everything else on the map is unexplored. ' +
    (question.observation.blind ? 'It has NO ranging sensor or camera: it finds walls only by driving into them. ' : '') +
    (question.unknown.length > 0 ? `Unknown to this robot: ${question.unknown.join('; ')}. ` : '') +
    (open.length > 0
      ? `Objectives still open: ${open.map((objective) => `${objective.label} (${objective.have} of ${objective.need})`).join('; ')}. `
      : 'Every objective is done: what remains is reaching the end point. ') +
    `Energy: the battery is at ${round(question.energy.batteryPct)} %, enough for about ${question.energy.rangeTiles} tiles at this pace` +
    (projected === undefined ? '; the robot knows no way to the end point yet. ' : `; after the known way to the end point it would have ${round(projected)} % left (${marginLevel(projected)}). `) +
    'A robot that runs out of charge before the end point fails the mission, so an option whose charge after driving on to the end point "would not get back" is only correct when no other option makes progress. ' +
    (briefing ? `The player gave the driver these instructions: "${briefing}" Follow them where the options allow. ` : '') +
    'Rule: prefer doing a known open objective; explore when no open objective is reachable; return to the end point when every objective is done or when the charge is critical; wait only for moving traffic to pass. ' +
    'Each option states what the move is and what the simulation predicts for it; a prediction over unseen ground is a guess.';
  return {
    state: {
      mission: question.objective,
      sensors: question.knew,
      unknown: question.unknown,
      energy: { batteryPct: round(question.energy.batteryPct, 1), rangeTiles: question.energy.rangeTiles, ...(projected === undefined ? {} : { afterWayToEndPct: round(projected) }) },
      objectives: question.objectives.map((objective) => ({ label: objective.label, done: objective.done, have: objective.have, need: objective.need })),
      robot: { pace: question.observation.pace, carrying: question.observation.carrying, damagePct: round(question.observation.damagePct, 1), mapExploredPct: round(question.observation.exploredPct) },
      askedBecause: question.trigger.label,
    },
    instructions,
    criteria: Object.fromEntries(question.options.map((option) => [option.id, describeOption(option)])),
    optionIds: question.options.map((option) => option.id),
  };
}

/** The same question as a Jev System One request: one Choice over the option ids. */
export function buildLabJevRequest(question: LabQuestionLike, model: string = JEV_MODEL_ID): JevRequest {
  const parts = buildLabPromptParts(question);
  return { model, state: parts.state, questions: { action: { type: 'choice', instructions: parts.instructions, criteria: parts.criteria } } };
}

export const LAB_SYSTEM =
  'You are the driver of a small robot in a grid-world simulation. You are asked one multiple-choice question at a time. ' +
  'Answer with a single JSON object and nothing else: {"choice": "<one of the option ids>", "confidence": <number from 0 to 1>}. ' +
  'No explanation, no code fence, no other keys.';

/** The same question as plain text for an LLM. */
export function buildLabTextPrompt(question: LabQuestionLike): { system: string; user: string; optionIds: readonly string[] } {
  const parts = buildLabPromptParts(question);
  const user = [
    'STATE (JSON):',
    JSON.stringify(parts.state),
    '',
    'QUESTION:',
    parts.instructions,
    '',
    'OPTIONS (id: meaning):',
    ...parts.optionIds.map((id) => `- ${id}: ${parts.criteria[id]}`),
    '',
    `Reply with JSON only: {"choice": one of [${parts.optionIds.join(', ')}], "confidence": 0..1}`,
  ].join('\n');
  return { system: LAB_SYSTEM, user, optionIds: parts.optionIds };
}

/** Reads {choice, confidence} from an LLM reply. Throws when the choice is not one of the option ids. */
export function parseLabAnswer(text: string, optionIds: readonly string[]): { choice: string; confidence: number } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('the reply holds no JSON object');
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  const record = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const choice = optionIds.find((id) => id === record.choice);
  if (!choice) throw new Error('the reply does not choose one of the options');
  const confidence = typeof record.confidence === 'number' && Number.isFinite(record.confidence) ? Math.min(1, Math.max(0, record.confidence)) : 0;
  return { choice, confidence };
}
