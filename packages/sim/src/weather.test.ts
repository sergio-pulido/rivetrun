import { describe, expect, it } from 'vitest';
import type { Build, Conditions, Mission, RunEvent } from '@rivetrun/contracts';
import { MISSIONS, PRESETS, capacityFactor, createRun, gustAt, heuristicBrain, observe, runController, runHeadless, step } from './index';

const withWeather = (mission: Mission, conditions: Conditions): Mission => ({ ...mission, conditions });
const speedster = PRESETS.speedster.build;
const allRounder = PRESETS.all_rounder.build;
const outcome = async (mission: Mission, build: Build) => (await runHeadless(mission, 7, build, heuristicBrain)).episode.outcome;

describe('weather: wind', () => {
  it('a headwind costs energy and time, a tailwind saves energy; a mission without wind is untouched', async () => {
    const calm = await outcome(MISSIONS.M1, speedster);
    const head = await outcome(withWeather(MISSIONS.M1, { windMps: 12 }), speedster);
    const tail = await outcome(withWeather(MISSIONS.M1, { windMps: -12 }), speedster);
    expect(head.energyUsedPct).toBeGreaterThan(calm.energyUsedPct * 1.5);
    expect(head.timeS).toBeGreaterThan(calm.timeS);
    expect(tail.energyUsedPct).toBeLessThan(calm.energyUsedPct);
    const still = createRun({ mission: MISSIONS.M1, seed: 7, build: speedster, priority: 0.5 });
    expect(step(still, 'accelerate').sim.windMps).toBeUndefined();
  });

  it('on ice a strong headwind is more than the tyres can hold: the run that finishes in calm air does not', async () => {
    expect((await outcome(MISSIONS.M4, allRounder)).finished).toBe(true);
    expect((await outcome(withWeather(MISSIONS.M4, { windMps: 12 }), allRounder)).finished).toBe(false);
  });

  it('gusts are seeded events: same seed, same gusts; the IMU feels them and a build without one is told nothing', async () => {
    const gusty = withWeather(MISSIONS.M1, { windMps: 4, gustMps: 12 });
    const withImu: Build = { ...allRounder, sensors: ['camera', 'imu'] };
    const events: RunEvent[] = [];
    const episode = await runController({ mission: gusty, seed: 7, build: withImu, priority: 0.5 }, heuristicBrain, { onEvent: (e) => events.push(e), timeScale: 200 }).start();
    const gusts = events.filter((e) => e.type === 'gust');
    expect(gusts.filter((e) => e.type === 'gust' && e.on).length).toBeGreaterThan(1);
    expect(gusts.every((e) => e.type === 'gust' && (e.on ? e.windMps > 4 : e.windMps === 4))).toBe(true);
    expect(episode.decisions.some((d) => d.log?.trigger.cause === 'gust_start')).toBe(true);

    const again = await runHeadless(gusty, 7, withImu, heuristicBrain);
    const first = await runHeadless(gusty, 7, withImu, heuristicBrain);
    expect(again.episode.outcome).toEqual(first.episode.outcome);

    // No IMU: the gust still pushes the robot, but nothing reports it.
    const noImu = allRounder;
    const blindToGusts = await runHeadless(gusty, 7, noImu, heuristicBrain);
    expect(blindToGusts.episode.decisions.some((d) => d.log?.trigger.cause === 'gust_start')).toBe(false);
    let state = createRun({ mission: gusty, seed: 7, build: noImu, priority: 0.5 });
    for (let i = 0; i < 400 && gustAt(state.environment, state.sim.t) === 0; i += 1) state = step(state, 'cruise');
    expect(state.sim.gust).toBe(true);
    expect(observe(state).gusting).toBe('unknown');
    expect(observe(state).conditions).toEqual({ windMps: 4, gustMps: 12 });
  }, 20000);
});

describe('weather: cold', () => {
  it('usable capacity falls about 1 % per °C below 20 °C, so the same run uses more of the pack', async () => {
    const at = (temperatureC: number) => capacityFactor(createRun({ mission: withWeather(MISSIONS.M1, { temperatureC }), seed: 1, build: allRounder, priority: 0.5 }).environment);
    expect([at(20), at(0), at(-20), at(-40)]).toEqual([1, 0.8, 0.6, 0.5]);
    const mild = await outcome(MISSIONS.M1, speedster);
    const frozen = await outcome(withWeather(MISSIONS.M1, { temperatureC: -20 }), speedster);
    expect(frozen.energyUsedPct).toBeGreaterThan(mild.energyUsedPct * 1.4);
  });
});

describe('weather: visibility', () => {
  const rangeIn = (conditions: Conditions, build: Build): number =>
    observe(createRun({ mission: withWeather(MISSIONS.M1, conditions), seed: 1, build, priority: 0.5 })).forwardRangeM;
  const only = (sensor: string): Build => ({ ...allRounder, sensors: [sensor] });

  it('fog and night shorten what a camera sees; darkness does not touch lidar, snow and heavy rain do; ultrasonic is unaffected', () => {
    const camera = only(allRounder.sensors.find((id) => id.includes('camera'))!);
    const clear = rangeIn({}, camera);
    expect(rangeIn({ visibility: 'fog' }, camera)).toBeCloseTo(clear * 0.35, 1);
    expect(rangeIn({ visibility: 'night' }, camera)).toBeCloseTo(clear * 0.25, 1);

    const lidar = only('lidar_rplidar_c1');
    const reach = rangeIn({}, lidar);
    expect(rangeIn({ visibility: 'night' }, lidar)).toBe(reach);
    expect(rangeIn({ precipitation: 'snow' }, lidar)).toBeCloseTo(reach * 0.6, 1);
    expect(rangeIn({ precipitation: 'heavy_rain' }, lidar)).toBeCloseTo(reach * 0.6, 1);

    const ultrasonic = only(PRESETS.mud_crawler.build.sensors.find((id) => id.includes('ultrasonic')) ?? 'ultrasonic');
    expect(rangeIn({ visibility: 'fog', precipitation: 'snow' }, ultrasonic)).toBe(rangeIn({}, ultrasonic));
  });

  it('night changes a heuristic run: the hazard is seen later, so the decisions differ', async () => {
    const day = await runHeadless(MISSIONS.M1, 7, speedster, heuristicBrain);
    const night = await runHeadless(withWeather(MISSIONS.M1, { visibility: 'night' }), 7, speedster, heuristicBrain);
    const seenAt = (run: typeof day): number | undefined => run.episode.decisions.find((d) => d.log?.trigger.cause === 'hazard_seen')?.t;
    expect(night.episode.outcome).not.toEqual(day.episode.outcome);
    if (seenAt(day) !== undefined && seenAt(night) !== undefined) expect(seenAt(night)!).toBeGreaterThan(seenAt(day)!);
  });
});
