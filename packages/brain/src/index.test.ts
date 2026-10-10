import type { BrainQuestion, Observation } from '@rivetrun/contracts';
import { describe, expect, it } from 'vitest';
import { buildJevRequest, createJevBrain, JEV_MODEL_ID, JevError, parseJevResponse } from './index';

const question: BrainQuestion = {
  missionId: 'M1',
  t: 3,
  trigger: 'terrain_ahead',
  perceived: {
    terrainAhead: 'mud',
    terrainAheadDistanceM: 2.4,
    obstacleAheadM: 'unknown',
    slipPct: 12,
    tiltDeg: 'unknown',
    depthAheadCm: 'unknown',
  },
  status: { speedMps: 1.4, batteryPct: 71, damagePct: 8 },
  priority: 0.8,
  options: ['cruise', 'slow_down', 'brake'],
  lookahead: [
    { action: 'cruise', progressM: 2.1, damagePct: 4, energyPct: 0.4 },
    { action: 'slow_down', progressM: 1.2, damagePct: 0, energyPct: 0.3 },
    { action: 'brake', progressM: 0.2, damagePct: 0, energyPct: 0.1 },
  ],
};

describe('brain', () => {
  it('pins a versioned model id, not an alias', () => {
    expect(JEV_MODEL_ID).toMatch(/^jev-\d+\.\d+\.\d+$/);
  });

  it('builds one choice question: options with lookahead numbers, priority in the instructions', () => {
    const request = buildJevRequest(question);
    expect(request.model).toBe(JEV_MODEL_ID);
    expect(request.state).toEqual({ perceived: question.perceived, robot: { ...question.status, motion: 'moving' } });
    expect(Object.keys(request.questions.action.criteria)).toEqual(question.options);
    expect(request.questions.action.criteria.cruise).toContain('progress 2.1 m');
    expect(request.questions.action.instructions).toContain('0.8');
  });

  it('offers jump with its own rule only when the build has the piston', () => {
    expect(buildJevRequest(question).questions.action.instructions).not.toContain('`jump`');
    const withJump = buildJevRequest({
      ...question,
      options: [...question.options, 'jump'],
      lookahead: [...question.lookahead, { action: 'jump', progressM: 2.6, damagePct: 0, energyPct: 1.2 }],
    });
    expect(withJump.questions.action.criteria.jump).toContain('Fire the piston');
    expect(withJump.questions.action.instructions).toContain('`jump` is only correct');
  });

  it('tells Jev about a hazard seen beyond the simulated window (lidar range)', () => {
    const near = buildJevRequest(question);
    expect(near.questions.action.instructions).not.toContain('NOT in any predicted damage');
    const far = buildJevRequest({ ...question, perceived: { ...question.perceived, obstacleAheadM: 9 } });
    expect(far.questions.action.instructions).toContain('an obstacle 9 m ahead');
    // cruise covers 2.1 m in 1.5 s: 6.9 m left at 1.4 m/s is about 4.9 s away.
    expect(far.questions.action.criteria.cruise).toContain('6.9 m ahead, reached in about 4.9 s at this pace (later)');
    expect(far.questions.action.criteria.brake).toContain('8.8 m ahead');
  });

  describe('brain v3: the question is built from the Observation only', () => {
    const observation: Observation = {
      sources: ['core', 'lidar'],
      speedMps: 2.2,
      odometerM: 22,
      missionLengthM: 62,
      remainingM: 40,
      batteryPct: 41,
      drawW: 18,
      projectedFinishPct: 6,
      damagePct: 12,
      scanZones: [{ id: 'z1', label: 'Thermal vent', distanceM: 14, canScan: false, done: false, missed: false }],
      tiltDeg: 'unknown',
      slipPct: 'unknown',
      slipping: 'unknown',
      forwardRangeM: 12,
      blind: false,
      hazard: { source: 'lidar', distanceM: 11 },
      gap: null,
      terrainAhead: 'unknown',
      waterDepthCm: 'unknown',
      lastContact: 'unknown',
      actuators: { jumpReadyInS: 'unknown', winch: false, climbMode: true },
      unknown: ['slope and slip: no IMU', 'terrain type ahead: no camera or drone'],
      lines: ['CORE · 2.2 m/s · battery 41 %', 'LIDAR · obstacle 11 m'],
    };
    const v3: BrainQuestion = {
      ...question,
      // Deliberately wrong legacy readings: a v3 question must not read them.
      perceived: { ...question.perceived, terrainAhead: 'water', obstacleAheadM: 0.3, slipPct: 99 },
      observation,
      cause: { kind: 'perception', cause: 'hazard_seen', source: 'lidar', label: 'LIDAR · obstacle 11 m' },
      gameplayVersion: 3,
      lookahead: [
        { action: 'cruise', progressM: 2.1, damagePct: 0, energyPct: 0.4, projectedFinishPct: 6, assumed: true },
        { action: 'slow_down', progressM: 1.2, damagePct: 0, energyPct: 0.3, projectedFinishPct: 19 },
        { action: 'brake', progressM: 0.2, damagePct: 0, energyPct: 0.1, projectedFinishPct: -4 },
      ],
    };
    const request = buildJevRequest(v3);
    const text = JSON.stringify(request);

    it('tells Jev to ease in when a zone it can scan is close ahead, and to scan once on it (Q13)', () => {
      const zone = { id: 'z1', label: 'Survivor', distanceM: 3, canScan: true, done: false, missed: false };
      const instructions = (q: BrainQuestion): string => buildJevRequest(q).questions.action.instructions;
      const approaching = instructions({ ...v3, observation: { ...observation, scanZones: [zone] } });
      expect(approaching).toContain('The scan zone "Survivor" is 3 m ahead');
      expect(approaching).toContain('`slow_down` is the correct option now');
      expect(instructions(v3)).not.toContain('is the correct option now');
      expect(instructions({ ...v3, observation: { ...observation, scanZones: [{ ...zone, canScan: false }] } })).not.toContain('is the correct option now');
      const on = instructions({ ...v3, options: [...v3.options, 'scan'], observation: { ...observation, scanZones: [{ ...zone, distanceM: 0.2 }] } });
      expect(on).toContain('The scan zone "Survivor" is under the robot right now');
    });

    it('sends the Observation and nothing from the legacy perception', () => {
      expect(request.state).not.toHaveProperty('perceived');
      expect(request.state.sensors).toEqual(observation.lines);
      expect(request.state.unknown).toEqual(observation.unknown);
      expect(text).not.toContain('"water"');
      expect(text).not.toContain('99');
    });

    it('says why it is asked, what is unknown and that the command holds', () => {
      const { instructions } = request.questions.action;
      expect(instructions).toContain('something changed: LIDAR · obstacle 11 m');
      expect(instructions).toContain('slope and slip: no IMU; terrain type ahead: no camera or drone');
      expect(instructions).toContain('There is no clock');
      expect(instructions).toContain('forward sensors reach 12 m');
    });

    it('carries the energy line: charge, draw, projected charge now and per option', () => {
      const { instructions, criteria } = request.questions.action;
      expect(instructions).toContain('battery is at 41 %, drawing 18 W');
      expect(instructions).toContain('charge at the finish would be 6 % (critical), with 40 m to go');
      expect(criteria.slow_down).toContain('Charge at the finish if this pace holds: 19 % (tight)');
      expect(criteria.brake).toContain('-4 % (runs out before the finish)');
    });

    it('flags predictions that ran onto unknown track and the far hazard from the Observation', () => {
      const { instructions, criteria } = request.questions.action;
      expect(criteria.cruise).toContain('runs past what the sensors know');
      expect(criteria.slow_down).not.toContain('runs past what the sensors know');
      expect(instructions).toContain('an obstacle 11 m ahead');
      expect(criteria.cruise).toContain('The obstacle is then 8.9 m ahead');
    });

    it('states the weather from the mission plan and a gust only as the IMU feels it', () => {
      expect(request.questions.action.instructions).not.toContain('Weather, known from the mission plan');
      const storm = buildJevRequest({ ...v3, observation: { ...observation, conditions: { windMps: 5, gustMps: 9, precipitation: 'heavy_rain', temperatureC: 8 }, gusting: 'unknown' } });
      const text = storm.questions.action.instructions;
      expect(text).toContain('headwind 5 m/s, gusts adding up to 9 m/s of headwind that come and go, heavy rain, 8 °C');
      expect(text).toContain('no IMU, so it cannot feel whether a gust');
      expect(text).toContain('no prediction sees a future gust');
      expect(storm.state.weather).toEqual({ windMps: 5, gustMps: 9, precipitation: 'heavy_rain', temperatureC: 8 });
      const felt = buildJevRequest({ ...v3, observation: { ...observation, conditions: { visibility: 'night', precipitation: 'snow', temperatureC: -20, windMps: -3 }, gusting: true } });
      expect(felt.questions.action.instructions).toContain('tailwind 3 m/s, snow, night, -20 °C');
      expect(felt.questions.action.instructions).toContain('The IMU feels a gust pushing against the robot right now');
    });

    it('tells a blind robot that it is blind', () => {
      const blind = buildJevRequest({ ...v3, observation: { ...observation, blind: true, forwardRangeM: 0, hazard: 'unknown' } });
      expect(blind.questions.action.instructions).toContain('NO forward sensor');
    });
  });

  it('parses probabilities, renormalised over the available options', () => {
    const parsed = parseJevResponse(
      {
        model: 'jev-1.13.0',
        answers: { action: { type: 'choice', choice: 'slow_down', probabilities: { cruise: 0.1, slow_down: 0.7 } } },
      },
      question.options,
    );
    expect(parsed.selected).toBe('slow_down');
    expect(parsed.probabilities.slow_down).toBeCloseTo(0.875);
    expect(parsed.probabilities.brake).toBe(0);
  });

  it('fails loudly without a key and on timeout', async () => {
    await expect(createJevBrain({ apiKey: '' }).decide(question)).rejects.toMatchObject({ code: 'missing_key' });
    const hang: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const slow = createJevBrain({ apiKey: 'k', timeoutMs: 20, fetch: hang });
    await expect(slow.decide(question)).rejects.toBeInstanceOf(JevError);
    await expect(slow.decide(question)).rejects.toMatchObject({ code: 'timeout' });
  });
});
