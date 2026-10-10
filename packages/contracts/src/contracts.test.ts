import { describe, expect, it } from 'vitest';
import {
  BrainDecisionSchema,
  BrainQuestionSchema,
  BuildSchema,
  DecisionRecordSchema,
  GhostTraceSchema,
  LeaderboardEntrySchema,
  LeaderboardQuerySchema,
  OutcomeSchema,
  RunEventSchema,
  SubmitRunRequestSchema,
  type BrainQuestion,
  type Outcome,
  type SimState,
} from './index';

const question: BrainQuestion = {
  missionId: 'M1',
  t: 1.5,
  trigger: 'interval',
  perceived: {
    terrainAhead: 'grass',
    terrainAheadDistanceM: 4.2,
    obstacleAheadM: null,
    slipPct: 'unknown',
    tiltDeg: 'unknown',
    depthAheadCm: 'unknown',
  },
  status: { speedMps: 1.2, batteryPct: 90, damagePct: 0 },
  priority: 0.5,
  options: ['cruise', 'accelerate', 'slow_down'],
  lookahead: [{ action: 'cruise', progressM: 1.8, damagePct: 0, energyPct: 0.4 }],
};

const state: SimState = {
  t: 0,
  x: 0,
  v: 0,
  slopeDeg: 0,
  pitch: 0,
  wheelSpin: 0,
  terrain: 'asphalt',
  battery: 100,
  damage: 0,
  effects: [],
};

const outcome: Outcome = {
  finished: true,
  timeS: 42,
  damagePct: 3,
  energyUsedPct: 20,
  costEur: 205,
  score: 733,
  progressFraction: 1,
  stars: 2,
};

describe('contracts', () => {
  it('accepts a valid BrainQuestion', () => {
    expect(BrainQuestionSchema.safeParse(question).success).toBe(true);
  });

  it('rejects duplicate options and lookahead for actions that are not options', () => {
    expect(BrainQuestionSchema.safeParse({ ...question, options: ['cruise', 'cruise'] }).success).toBe(false);
    expect(
      BrainQuestionSchema.safeParse({
        ...question,
        lookahead: [{ action: 'deploy_winch', progressM: 0, damagePct: 0, energyPct: 0 }],
      }).success,
    ).toBe(false);
  });

  it('BrainDecision carries policy and fallback', () => {
    const decision = {
      probabilities: { cruise: 0.7, slow_down: 0.3 },
      selected: 'cruise',
      policy: 'heuristic',
      fallback: true,
      latencyMs: 1200,
    };
    expect(BrainDecisionSchema.safeParse(decision).success).toBe(true);
    expect(BrainDecisionSchema.safeParse({ ...decision, policy: 'fallback' }).success).toBe(false);
    expect(BrainDecisionSchema.safeParse({ ...decision, fallback: undefined }).success).toBe(false);
  });

  it('limits sensors and extras to two each', () => {
    const build = { locomotion: 'wheels', motor: 'motor_light', battery: 'battery_small', sensors: [], extras: [] };
    expect(BuildSchema.safeParse(build).success).toBe(true);
    expect(BuildSchema.safeParse({ ...build, sensors: ['a', 'b', 'c'] }).success).toBe(false);
  });

  it('parses a GhostTrace and every RunEvent variant', () => {
    expect(GhostTraceSchema.safeParse({ policy: 'random', frames: [state], outcome }).success).toBe(true);
    const decision = { probabilities: { cruise: 1 }, selected: 'cruise', policy: 'jev', fallback: false, latencyMs: 110 };
    const events = [
      { type: 'frame', state },
      { type: 'decisionPending', t: 1, question },
      { type: 'decision', t: 1, question, decision },
      { type: 'terrainEnter', t: 2, terrain: 'grass', segmentIndex: 1 },
      { type: 'damage', t: 3, cause: 'impact', amountPct: 4, totalPct: 4 },
      { type: 'finish', t: 42, outcome },
      { type: 'dnf', t: 42, reason: 'battery', outcome: { ...outcome, finished: false } },
    ];
    for (const event of events) {
      expect(RunEventSchema.safeParse(event).success, event.type).toBe(true);
    }
    expect(RunEventSchema.safeParse({ type: 'explode' }).success).toBe(false);
  });

  it('DecisionRecord keeps trigger and model; Outcome keeps the why line', () => {
    const record = {
      t: 1.5,
      perceived: question.perceived,
      options: question.options,
      probabilities: { cruise: 1 },
      selected: 'cruise',
      policy: 'jev',
      fallback: false,
      latencyMs: 110,
      trigger: 'interval',
      model: 'jev-1.13.0',
    };
    expect(DecisionRecordSchema.parse(record)).toMatchObject({ trigger: 'interval', model: 'jev-1.13.0' });
    expect(OutcomeSchema.parse({ ...outcome, why: 'Slipped 6 s on ice — no IMU' }).why).toContain('no IMU');
  });

  it('accepts leaderboard timestamps with Z or an offset', () => {
    const entry = { rank: 1, nickname: 'ada', missionId: 'M5', score: 700, timeS: 50, damagePct: 0, policy: 'jev' };
    expect(LeaderboardEntrySchema.safeParse({ ...entry, createdAt: '2026-10-10T09:00:00.000Z' }).success).toBe(true);
    expect(LeaderboardEntrySchema.safeParse({ ...entry, createdAt: '2026-10-10T09:00:00+00:00' }).success).toBe(true);
  });

  it('validates API payloads', () => {
    expect(LeaderboardQuerySchema.parse({})).toEqual({ mission: 'M5' });
    expect(LeaderboardQuerySchema.safeParse({ mission: 'M0' }).success).toBe(false);
    expect(SubmitRunRequestSchema.safeParse({ nickname: '<script>', episode: {} }).success).toBe(false);
  });
});

describe('RR-PLAN contracts', () => {
  it('PlayerPick: three taps, no free text; strategy is the plan or a briefing preset', async () => {
    const { BRIEFING_PRESETS, BriefingPresetIdSchema, PlayerPickSchema, PlanSchema, DEFAULT_PLAY_PICK } = await import('./index');
    expect([...BriefingPresetIdSchema.options]).toEqual(BRIEFING_PRESETS.map((preset) => preset.id));
    expect(PlayerPickSchema.safeParse({ ...DEFAULT_PLAY_PICK, agent: 'jev-1.13.0' }).success).toBe(true);
    expect(PlayerPickSchema.safeParse({ presetId: 'speedster', agent: 'human', strategy: 'eco' }).success).toBe(true);
    expect(PlayerPickSchema.safeParse({ presetId: 'speedster', agent: 'human', strategy: 'Drive fast please' }).success).toBe(false);
    expect(PlayerPickSchema.safeParse({ presetId: 'tank', agent: 'human', strategy: 'plan' }).success).toBe(false);
    const plan = {
      build: { locomotion: 'offroad_wheels', motor: 'motor_torque', battery: 'battery_large', sensors: ['camera', 'ultrasonic'], extras: ['bumper'] },
      presetId: 'all_rounder', priority: 0.4, briefing: 'Ease in for the scan pad, climb mode on the mud slope.',
      rationale: 'Mud slope needs torque and grip; one scan zone needs the camera.',
      partsWhy: [{ partId: 'motor_torque', why: 'Climbs the 10° mud slope' }],
      generatedBy: { provider: 'anthropic', model: 'claude-sonnet-5-5', ms: 14200, at: '2026-10-10T13:00:00.000Z' },
    };
    expect(PlanSchema.safeParse(plan).success).toBe(true);
    expect(PlanSchema.safeParse({ ...plan, briefing: 'x'.repeat(141) }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...plan, partsWhy: Array.from({ length: 5 }, () => plan.partsWhy[0]) }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...plan, priority: 1.4 }).success).toBe(false);
  });
});
