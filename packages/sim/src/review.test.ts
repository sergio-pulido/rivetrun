import { describe, expect, it } from 'vitest';
import type { Action, Brain, Build, Mission, RunEvent } from '@rivetrun/contracts';
import { OutcomeSchema } from '@rivetrun/contracts';
import { MISSIONS, PRESETS, createRun, driveController, driveSeed, heuristicBrain, heuristicDecide, replayEpisode, runController, runHeadless, step } from './index';

// Regression tests for the review round of 10 October (a fresh reviewer on packages/sim and packages/contracts).
const allRounder = PRESETS.all_rounder.build;
const jumper: Build = { ...allRounder, extras: ['piston_jump'] };
const flat: Mission = { ...MISSIONS.M1, scanZones: [], track: { segments: [{ terrain: 'asphalt', lengthM: 60, slopeDeg: 0 }] } };

describe('review: a pedal held through a piston jump is not an air input', () => {
  const hop = (pedal: Action) => {
    let state = createRun({ mission: flat, seed: 1, build: jumper, priority: 0.5, manual: true });
    for (let i = 0; i < 40; i += 1) state = step(state, pedal);
    state = step(state, 'jump');
    for (let i = 0; i < 200 && !state.done; i += 1) {
      state = step(state, pedal);
      if (state.lastAir?.type === 'landed') return state.lastAir;
    }
    throw new Error('never landed');
  };

  it('full throttle, steady or nothing held: the jump lands clean every time', () => {
    for (const pedal of ['accelerate', 'cruise', 'coast'] as const) {
      const landed = hop(pedal);
      expect(landed.grade, pedal).toBe('clean');
      expect(landed.pitchErrorDeg, pedal).toBe(0);
    }
  });

  it('a pedal changed in the air after a jump still turns the nose', () => {
    let state = createRun({ mission: flat, seed: 1, build: jumper, priority: 0.5, manual: true });
    for (let i = 0; i < 40; i += 1) state = step(state, 'cruise');
    state = step(state, 'jump');
    state = step(state, 'cruise');
    for (let i = 0; i < 200 && state.lastAir?.type !== 'landed'; i += 1) state = step(state, 'brake');
    expect(state.lastAir?.type === 'landed' && state.lastAir.pitchErrorDeg).toBeLessThan(-10);
  });
});

describe('review: controllers that are stopped', () => {
  it('stop() before start(): start() resolves at once, asks no brain and emits nothing', async () => {
    let asked = 0;
    const brain: Brain = { decide: async (q) => { asked += 1; return heuristicDecide(q); } };
    const events: RunEvent[] = [];
    const live = runController({ mission: MISSIONS.M1, seed: 1, build: allRounder, priority: 0.5 }, brain, { onEvent: (e) => events.push(e) });
    live.stop();
    const episode = await live.start();
    expect(episode.outcome.finished).toBe(false);
    expect(asked).toBe(0);
    expect(events).toEqual([]);

    const drive = driveController({ mission: MISSIONS.M1, seed: 1, build: allRounder, priority: 0.5 }, () => ({ throttle: 1, brake: 0 }), { onEvent: (e) => events.push(e) });
    drive.stop();
    expect((await drive.start()).outcome.finished).toBe(false);
    expect(events).toEqual([]);
  });

  it('a run that ends while a decision is pending is no longer "thinking"; stop() from a handler ends the stepping', async () => {
    // A brain that never answers: the run ends (stuck, no command after the start) with a question open.
    const silent: Brain = { decide: () => new Promise(() => undefined) };
    let frames = 0;
    const controller = runController({ mission: MISSIONS.M1, seed: 1, build: allRounder, priority: 0.5 }, silent, {
      timeScale: 400,
      onEvent: (event) => {
        if (event.type !== 'frame') return;
        frames += 1;
        if (frames === 30) controller.stop();
      },
    });
    expect(controller.isDecisionPending()).toBe(false);
    await controller.start();
    expect(controller.isDecisionPending()).toBe(false);
    // Stopped at the 30th frame: the loop did not go on emitting the rest of the batch.
    expect(frames).toBe(30);
  });
});

describe('review: inputs taken on trust', () => {
  it('a brain that reports a latency that is not a number still drives', async () => {
    for (const latencyMs of [Number.NaN, Number.POSITIVE_INFINITY, -50]) {
      const odd: Brain = { decide: async (q) => ({ ...heuristicDecide(q), latencyMs }) };
      const { episode } = await runHeadless(MISSIONS.M1, 1, allRounder, odd);
      expect(episode.decisions.length, String(latencyMs)).toBeGreaterThan(3);
      expect(episode.outcome.finished, String(latencyMs)).toBe(true);
      expect(episode.decisions.every((d) => Number.isFinite(d.latencyMs) && d.latencyMs >= 0)).toBe(true);
    }
  });

  it('replayEpisode says why instead of throwing: unknown mission, unknown part, a broken log entry', async () => {
    const live = await driveController({ mission: MISSIONS.M1, seed: driveSeed(MISSIONS.M1), build: allRounder, priority: 0.5 }, () => ({ throttle: 1, brake: 0 }), { onEvent: () => undefined, timeScale: 400, hints: false }).start();
    expect(replayEpisode(live)).toMatchObject({ ok: true, matches: true });
    expect(replayEpisode({ ...live, missionId: 'M99' as never })).toEqual({ ok: false, reason: 'unknown mission M99' });
    const badPart = replayEpisode({ ...live, build: { ...live.build, motor: 'warp_drive' } });
    expect(badPart.ok === false && badPart.reason).toMatch(/^could not be replayed: /);
    const badLog = replayEpisode({ ...live, outcome: { ...live.outcome, breakdown: { ...live.outcome.breakdown!, inputLog: [null as never] } } });
    expect(badLog.ok === false && badLog.reason).toMatch(/^could not be replayed: /);
  }, 20000);

  it('a throttle that is not a number is no throttle, and the episode still matches its schema', async () => {
    let t = 0;
    const episode = await driveController(
      { mission: MISSIONS.M1, seed: 1, build: allRounder, priority: 0.5 },
      () => ({ throttle: t > 1 && t < 2 ? Number.NaN : 1, brake: 0 }),
      { timeScale: 400, hints: false, onEvent: (event) => { if (event.type === 'frame') t = event.state.t; } },
    ).start();
    expect(OutcomeSchema.safeParse(episode.outcome).success).toBe(true);
    expect(episode.outcome.breakdown!.inputLog!.every((entry) => Number.isFinite(entry.throttle))).toBe(true);
  }, 20000);

  it('fog or cold without wind does not switch air drag on in the predicted outcomes', async () => {
    const calm = await runHeadless(MISSIONS.M1, 3, allRounder, heuristicBrain);
    const foggyNoCamera: Build = { ...allRounder, sensors: ['ultrasonic'] };
    const clear = await runHeadless(MISSIONS.M1, 3, foggyNoCamera, heuristicBrain);
    // Fog changes nothing for a build with no camera: same questions, same run.
    const fog = await runHeadless({ ...MISSIONS.M1, conditions: { visibility: 'fog' } }, 3, foggyNoCamera, heuristicBrain);
    expect(fog.episode.outcome.timeS).toBe(clear.episode.outcome.timeS);
    expect(fog.episode.decisions.map((d) => d.selected)).toEqual(clear.episode.decisions.map((d) => d.selected));
    expect(calm.episode.outcome.finished).toBe(true);
  });
});
