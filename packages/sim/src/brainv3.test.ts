import { describe, expect, it } from 'vitest';
import type { Brain, Build, Mission, RunEvent } from '@rivetrun/contracts';
import { MISSIONS, PRESETS, createRun, heuristicBrain, heuristicDecide, observe, runController, runHeadless, senses, step } from './index';

const blind: Build = { locomotion: 'offroad_wheels', motor: 'motor_torque', battery: 'battery_large', sensors: [], extras: [] };
const withImu: Build = { ...blind, sensors: ['imu'] };
const sighted: Build = { ...blind, sensors: ['camera', 'ultrasonic'], extras: ['bumper'] };

const strip = (lengthM: number): Mission => ({
  id: 'M1', name: 'Uniform strip', description: '', weather: 'clear', starThreshold: 0, leaderboard: false, fixedSeed: 5,
  track: { segments: [{ terrain: 'asphalt', lengthM, slopeDeg: 0 }] },
});
const rockAhead: Mission = {
  ...strip(40),
  track: { segments: [{ terrain: 'asphalt', lengthM: 20, slopeDeg: 0 }, { terrain: 'asphalt', lengthM: 20, slopeDeg: 0, obstacle: 'rock' }] },
};

/** The heuristic, answering after a fixed delay. */
const slowBrain = (latencyMs: number): Brain => ({ decide: async (question) => ({ ...heuristicDecide(question), latencyMs }) });

describe('Brain v3: the brain knows only what its sensors report', () => {
  it('a blind build is told nothing about the track ahead, and hits the rock', async () => {
    const start = observe(createRun({ mission: rockAhead, seed: 1, build: blind, priority: 0.5 }));
    expect(start.sources).toEqual(['core']);
    expect(start.blind).toBe(true);
    expect([start.hazard, start.gap, start.terrainAhead, start.tiltDeg, start.slipPct, start.waterDepthCm, start.lastContact]).toEqual(Array(7).fill('unknown'));
    expect(senses(blind).cannot.join(' ')).toMatch(/no forward sensor/);

    const { episode } = await runHeadless(rockAhead, 1, blind, heuristicBrain);
    // No decision ever mentions the rock before contact: every one was asked with the hazard unknown.
    expect(episode.decisions.every((d) => d.log?.trigger.cause !== 'hazard_seen' && d.log?.trigger.cause !== 'hazard_reached')).toBe(true);
    expect(episode.outcome.damagePct).toBeGreaterThan(5);
    expect(episode.outcome.why).toMatch(/Hit the rock at 2 m\/s/);

    // The same robot with eyes slows down for it.
    const seen = await runHeadless(rockAhead, 1, sighted, heuristicBrain);
    expect(seen.episode.decisions.some((d) => d.log?.trigger.cause === 'hazard_seen')).toBe(true);
    expect(seen.episode.outcome.damagePct).toBeLessThan(episode.outcome.damagePct / 2);
  });

  it('the blind hit is reported as BLIND on the event stream', async () => {
    const events: RunEvent[] = [];
    const controller = runController({ mission: rockAhead, seed: 1, build: blind, priority: 0.5 }, heuristicBrain, { onEvent: (e) => events.push(e), timeScale: 60 });
    await controller.start();
    const hit = events.find((e) => e.type === 'damage' && e.obstacle === 'rock');
    expect(hit && hit.type === 'damage' && hit.blind).toBe(true);
    expect(hit && hit.type === 'damage' && hit.label).toMatch(/^BLIND · hit rock at \d+ m: no distance sensor$/);
  }, 20000);

  it('a build without an IMU never reports slip or tilt; one with an IMU does', async () => {
    // Ice slope and mud: plenty of real slip.
    for (const mission of [MISSIONS.M3, MISSIONS.M4]) {
      const { episode } = await runHeadless(mission, 1, sighted, heuristicBrain);
      expect(episode.decisions.length).toBeGreaterThan(3);
      for (const decision of episode.decisions) {
        expect(decision.log?.trigger.cause.startsWith('slip')).toBe(false);
        expect(decision.log?.trigger.cause.startsWith('tilt')).toBe(false);
        expect(decision.log?.knew.join(' ')).not.toMatch(/slip|tilt/i);
      }
    }
    let state = createRun({ mission: MISSIONS.M3, seed: 1, build: sighted, priority: 0.5 });
    for (let i = 0; i < 400 && !state.done; i += 1) {
      state = step(state, 'accelerate');
      const seen = observe(state);
      expect([seen.slipPct, seen.slipping, seen.tiltDeg]).toEqual(['unknown', 'unknown', 'unknown']);
    }
    const felt = await runHeadless(MISSIONS.M3, 1, withImu, heuristicBrain);
    expect(felt.episode.decisions.some((d) => d.log?.trigger.source === 'imu')).toBe(true);
  });
});

describe('Brain v3: the brain decides when something changes', () => {
  it('asks once on a long uniform segment: there is no clock', async () => {
    const { episode } = await runHeadless(strip(100), 1, PRESETS.all_rounder.build, heuristicBrain);
    expect(episode.outcome.finished).toBe(true);
    expect(episode.outcome.timeS).toBeGreaterThan(40);
    expect(episode.decisions.map((d) => d.log?.trigger.cause)).toEqual(['start']);
  });

  it('holds the last command while a slow brain thinks, and the wait costs distance', async () => {
    const quick = await runHeadless(rockAhead, 1, sighted, slowBrain(0));
    const slow = await runHeadless(rockAhead, 1, sighted, slowBrain(900));
    const seenQuick = quick.episode.decisions.find((d) => d.log?.trigger.cause === 'hazard_seen')!.log!;
    const seenSlow = slow.episode.decisions.find((d) => d.log?.trigger.cause === 'hazard_seen')!.log!;
    expect(seenQuick.lostM).toBe(0);
    expect(seenSlow.appliedT - seenSlow.t).toBeCloseTo(0.9, 5);
    expect(seenSlow.lostM).toBeGreaterThan(1);
    expect(seenSlow.chip).toMatch(/· 900 ms$/);
    expect(slow.episode.outcome).not.toEqual(quick.episode.outcome);
  });

  it('is deterministic: the same seed and the same latencies give the same run', async () => {
    for (const mission of [MISSIONS.M4, MISSIONS.M7]) {
      const a = await runHeadless(mission, 9, PRESETS.all_rounder.build, slowBrain(350));
      const b = await runHeadless(mission, 9, PRESETS.all_rounder.build, slowBrain(350));
      expect(a.ghost).toEqual(b.ghost);
      expect(a.episode.decisions).toEqual(b.episode.decisions);
    }
  });

  it('every decision carries its log: trigger, what the brain knew, options, choice and latency', async () => {
    const { episode } = await runHeadless(MISSIONS.M5, 1, PRESETS.all_rounder.build, heuristicBrain);
    for (const decision of episode.decisions) {
      const log = decision.log!;
      expect(log.trigger.label.length).toBeGreaterThan(3);
      expect(log.knew[0]).toMatch(/^CORE · /);
      expect(log.options.map((o) => o.action)).toContain(log.choice);
      expect(log.options.every((o) => o.projectedFinishPct !== undefined)).toBe(true);
      expect(log.chip).toContain(' → ');
    }
    expect(new Set(episode.decisions.map((d) => d.log!.trigger.kind)).size).toBeGreaterThan(1);
  });
});
