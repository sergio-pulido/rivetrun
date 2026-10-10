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
    /** To the thing and on to where it goes. */
    readonly jobSteps?: number;
    /** All the known work if this goes first and the rest in its best order. */
    readonly tourSteps?: number;
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
  readonly energy: { readonly batteryPct: number; readonly projectedPct?: number; readonly rangeTiles: number; readonly workPct?: number };
  readonly objectives: readonly { readonly id: string; readonly label: string; readonly done: boolean; readonly have: number; readonly need: number }[];
  readonly options: readonly LabOptionLike[];
  readonly observation: { readonly blind: boolean; readonly exploredPct: number; readonly carrying: readonly string[]; readonly damagePct: number; readonly pace: string };
  readonly briefing?: string;
}

/** Version of the Lab question wording; part of the arena's Lab prompt hash. */
export const LAB_QUESTION_VERSION = 'lab-q3';

/**
 * Two wordings of the same question (docs/QA.md Q20):
 * - 'verdict': each option also says where it stands by the lab's fixed rules ("the correct job to start").
 * - 'facts': the same observation, options and predictions, and no judgement of any option anywhere.
 */
export type LabQuestionMode = 'verdict' | 'facts';
export const labQuestionVersion = (mode: LabQuestionMode = 'verdict'): string => (mode === 'facts' ? `${LAB_QUESTION_VERSION}-facts` : LAB_QUESTION_VERSION);
export { VERDICT_WORDS } from '../index';

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
      p.jobSteps !== undefined ? `${p.jobSteps} tiles for the whole job` : null,
      p.tourSteps !== undefined ? `${p.tourSteps} tiles for all the known work if this goes first` : null,
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

const chargeCritical = (question: LabQuestionLike): boolean => question.energy.projectedPct !== undefined && question.energy.projectedPct < 10;

/**
 * Where an option stands among the others, computed here and stated as a fact (docs/JEV.md: literal reading):
 * the model is not left to compare tile counts across options or to weigh "already doing this" against them.
 */
function standing(option: LabOptionLike, question: LabQuestionLike): string {
  const jobs = question.options.filter((o) => (o.kind === 'objective' || o.kind === 'interact') && o.predicted?.tourSteps !== undefined);
  const work = question.options.some((o) => o.kind === 'objective' || o.kind === 'interact');
  const openObjectives = question.objectives.some((objective) => !objective.done);
  if ((option.kind === 'objective' || option.kind === 'interact') && jobs.length > 1 && option.predicted?.tourSteps !== undefined) {
    const best = Math.min(...jobs.map((o) => o.predicted!.tourSteps!));
    const extra = option.predicted.tourSteps - best;
    return extra === 0 ? ' Of the jobs on offer this one gives the shortest total route: it is the correct job to start.' : ` Starting with this job makes the total route ${extra} tiles longer than the best job on offer.`;
  }
  if (option.kind === 'explore') {
    if (work) return ' A known objective is reachable, so exploring is not correct now.';
    const cost = (o: LabOptionLike): number => (o.predicted?.steps ?? 0) + (o.towardTiles ?? 0) + (o.visited ? 4 : 0);
    const explores = question.options.filter((o) => o.kind === 'explore');
    const best = Math.min(...explores.map(cost));
    return explores.length > 1 && cost(option) === best ? ' Of the directions on offer this one is the correct one to explore: it leads soonest toward what the robot still wants.' : '';
  }
  if (option.kind === 'return' && openObjectives && !option.completes) {
    return chargeCritical(question) ? ' The charge is critical, so returning now is correct.' : ' Objectives are still open and the charge is not critical, so this is not correct now.';
  }
  if (option.kind === 'wait') return question.options.some((o) => o.kind !== 'wait' && o.kind !== 'pace') ? ' Another move is on offer, and the robot plans its own way around traffic, so waiting is not correct now.' : '';
  if (option.kind === 'pace') return question.energy.projectedPct !== undefined && question.energy.projectedPct < 30 && /eco/.test(option.id) ? ' The charge is short, so the eco pace is correct now.' : ' The charge does not call for a change of pace, so this is not correct now.';
  return '';
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
export function buildLabPromptParts(question: LabQuestionLike, mode: LabQuestionMode = 'verdict'): LabPromptParts {
  const facts = mode === 'facts';
  const open = question.objectives.filter((objective) => !objective.done);
  const briefing = cleanBriefing(question.briefing);
  const projected = question.energy.projectedPct;
  const instructions =
    `A small robot is on a mission in a grid world it has to discover with its own sensors. Mission: ${question.objective} ` +
    (facts ? 'Choose one of the listed moves for it to make now. ' : 'Which of the listed moves should it make now? ') +
    `This decision is requested because something changed: ${question.trigger.label}. There is no clock: the chosen move stays in force until the next change. ` +
    'The robot knows only what its sensors have reported (`sensors`); everything else on the map is unexplored. ' +
    (question.observation.blind ? 'It has NO ranging sensor or camera: it finds walls only by driving into them. ' : '') +
    (question.unknown.length > 0 ? `Unknown to this robot: ${question.unknown.join('; ')}. ` : '') +
    (open.length > 0
      ? `Objectives still open: ${open.map((objective) => `${objective.label} (${objective.have} of ${objective.need})`).join('; ')}. `
      : 'Every objective is done: what remains is reaching the end point. ') +
    `Energy: the battery is at ${round(question.energy.batteryPct)} %, enough for about ${question.energy.rangeTiles} tiles at this pace` +
    (projected === undefined ? '; the robot knows no way to the end point yet. ' : `; after the known way to the end point it would have ${round(projected)} % left (${marginLevel(projected)}). `) +
    (question.energy.workPct !== undefined ? `The known work still to do would cost about ${round(question.energy.workPct)} % charge at this pace. ` : '') +
    (facts
      ? 'A robot that runs out of charge before the end point fails the mission. The mission is scored on objectives done and on reaching the end point, then on time, damage and charge used; every tile driven costs time and charge. '
      : 'A robot that runs out of charge before the end point fails the mission, so an option whose charge after driving on to the end point "would not get back" is only correct when no other option makes progress. ') +
    (briefing ? `The player gave the driver these instructions: "${briefing}" Follow them where the options allow. ` : '') +
    (facts
      ? ''
      : 'Rule: prefer doing a known open objective; explore when no open objective is reachable; return to the end point when every objective is done or when the charge is critical; wait only for moving traffic to pass; change pace only when the charge calls for it. ' +
        'When several options start a job, the correct one is the one with the fewest tiles for all the known work if it goes first, not the nearest. ') +
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
    criteria: Object.fromEntries(question.options.map((option) => [option.id, `${describeOption(option)}${facts ? '' : standing(option, question)}`])),
    optionIds: question.options.map((option) => option.id),
  };
}

/** The same question as a Jev System One request: one Choice over the option ids. */
export function buildLabJevRequest(question: LabQuestionLike, model: string = JEV_MODEL_ID, mode: LabQuestionMode = 'verdict'): JevRequest {
  const parts = buildLabPromptParts(question, mode);
  return { model, state: parts.state, questions: { action: { type: 'choice', instructions: parts.instructions, criteria: parts.criteria } } };
}

export const LAB_SYSTEM =
  'You are the driver of a small robot in a grid-world simulation. You are asked one multiple-choice question at a time. ' +
  'Answer with a single JSON object and nothing else: {"choice": "<one of the option ids>", "confidence": <number from 0 to 1>}. ' +
  'No explanation, no code fence, no other keys.';

/** The same question as plain text for an LLM. */
export function buildLabTextPrompt(question: LabQuestionLike, mode: LabQuestionMode = 'verdict'): { system: string; user: string; optionIds: readonly string[] } {
  const parts = buildLabPromptParts(question, mode);
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
