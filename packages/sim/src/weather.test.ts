import { describe, expect, it } from 'vitest';
import type { Build, Conditions, Mission, RunEvent } from '@rivetrun/contracts';
import { MISSIONS, PARTS, PRESETS, capacityFactor, createRun, gustAt, heuristicBrain, observe, runController, runHeadless, step, partWeatherNotes, weatherEffects } from './index';

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

  it('night changes a heuristic run', async () => {
    const day = await runHeadless(MISSIONS.M1, 7, speedster, heuristicBrain);
    const night = await runHeadless(withWeather(MISSIONS.M1, { visibility: 'night' }), 7, speedster, heuristicBrain);
    expect(night.episode.outcome).not.toEqual(day.episode.outcome);
  });
});

describe('weather: snow', () => {
  const strip = (terrain: 'asphalt' | 'snow' | 'ice'): Mission => ({ ...MISSIONS.M1, scanZones: [], track: { segments: [{ terrain, lengthM: 30, slopeDeg: 0 }] } });

  it('snow is slower and hungrier than asphalt (the robot sinks in) and grips better than ice', async () => {
    const road = await outcome(strip('asphalt'), allRounder);
    const snow = await outcome(strip('snow'), allRounder);
    expect(snow.finished).toBe(true);
    expect(snow.energyUsedPct).toBeGreaterThan(road.energyUsedPct * 1.5);
    const stopOn = (terrain: 'snow' | 'ice'): number => {
      let state = createRun({ mission: strip(terrain), seed: 1, build: allRounder, priority: 0.5, manual: true });
      for (let i = 0; i < 2000 && state.sim.x < 10; i += 1) state = step(state, 'climb_mode');
      const from = state.sim.x;
      for (let i = 0; i < 2000 && state.sim.v > 1e-3; i += 1) state = step(state, 'brake');
      return state.sim.x - from;
    };
    expect(stopOn('snow')).toBeLessThan(stopOn('ice'));
  });

  it('narrow road wheels bog down on a snowy slope that tracks climb', async () => {
    const hill: Mission = { ...MISSIONS.M1, scanZones: [], track: { segments: [{ terrain: 'asphalt', lengthM: 5, slopeDeg: 0 }, { terrain: 'snow', lengthM: 15, slopeDeg: 10 }] } };
    expect((await outcome(hill, speedster)).finished).toBe(false);
    expect((await outcome(hill, PRESETS.mud_crawler.build)).finished).toBe(true);
  });
});

describe('weather: what it does to a build, in words', () => {
  it('is empty on a calm clear mission and lists each active effect with the build\'s numbers otherwise', () => {
    expect(weatherEffects(allRounder, MISSIONS.M1)).toEqual([]);
    expect(weatherEffects(allRounder, MISSIONS.M5).map((e) => e.id)).toEqual(['rain_grip', 'camera_range', 'ranger_ok']);

    const storm = withWeather(MISSIONS.M4, { windMps: 6, gustMps: 8, visibility: 'night', temperatureC: -12 });
    const effects = weatherEffects(allRounder, storm);
    expect(effects.map((e) => e.id)).toEqual(['cold_ice', 'cold_capacity', 'headwind', 'gusts', 'camera_range', 'ranger_ok']);
    const byId = Object.fromEntries(effects.map((e) => [e.id, e]));
    expect(byId.cold_capacity!.detail).toContain('×0.7');
    expect(byId.camera_range!.detail).toBe('Camera range 1.5 m instead of 6 m');
    expect(byId.gusts!.detail).toContain('No IMU');
    expect(effects.every((e) => e.label.length > 0 && e.detail.length > 0)).toBe(true);
  });

  it('part sheets: notes only where weather changes what the part does', () => {
    expect(partWeatherNotes('lidar_rplidar_c1')[0]).toBe('Night: keeps its full range');
    expect(partWeatherNotes('camera')[0]).toBe('Night: range ×0.25, and it cannot scan without headlights');
    expect(partWeatherNotes('camera_module_3_noir')[0]).toBe('Night: keeps its full range and can scan');
    expect(partWeatherNotes('ambient_light_veml7700')).toHaveLength(1);
    expect(partWeatherNotes('ultrasonic')).toEqual(['Fog, rain, snow and darkness do not change its range']);
    expect(partWeatherNotes('tracks')).toEqual(['Snow: grip ×1.6']);
    for (const part of PARTS.filter((p) => p.slot === 'motor' || p.slot === 'extra')) expect(partWeatherNotes(part.id), part.id).toEqual([]);
  });
});

describe('weather missions', () => {
  const mean = async (mission: Mission, build: Build): Promise<{ finished: number; score: number; scans: number }> => {
    const runs = await Promise.all([1, 2, 3].map((seed) => runHeadless(mission, seed, build, heuristicBrain)));
    return {
      finished: runs.filter((r) => r.episode.outcome.finished).length,
      score: runs.reduce((sum, r) => sum + r.episode.outcome.score, 0) / runs.length,
      scans: runs.reduce((sum, r) => sum + (r.episode.outcome.breakdown?.scansDone ?? 0), 0),
    };
  };

  it('M8 Storm Ridge: the light Speedster usually runs its small pack flat in the wind; the heavy presets finish; gusts blow', async () => {
    expect((await mean(MISSIONS.M8, speedster)).finished).toBeLessThan(3);
    expect((await mean(MISSIONS.M8, allRounder)).finished).toBe(3);
    expect((await mean(MISSIONS.M8, PRESETS.mud_crawler.build)).finished).toBe(3);
    const events: RunEvent[] = [];
    await runController({ mission: MISSIONS.M8, seed: 1, build: allRounder, priority: 0.5 }, heuristicBrain, { onEvent: (e) => events.push(e), timeScale: 200 }).start();
    expect(events.some((e) => e.type === 'gust' && e.on)).toBe(true);
    expect(weatherEffects(allRounder, MISSIONS.M8).map((e) => e.id)).toEqual(['rain_grip', 'cold_capacity', 'headwind', 'gusts', 'camera_range', 'ranger_ok']);
  }, 20000);

  it('M9 Polar Night: an ordinary camera cannot scan the beacon in the dark; a NoIR camera or a light sensor can, and scores higher', async () => {
    const plain = await mean(MISSIONS.M9, allRounder);
    const noir = await mean(MISSIONS.M9, { ...allRounder, sensors: ['camera_module_3_noir', 'ultrasonic'] });
    const lit = await mean(MISSIONS.M9, { ...allRounder, sensors: ['camera', 'ambient_light_veml7700'] });
    expect([plain.finished, noir.finished, lit.finished]).toEqual([3, 3, 3]);
    expect([plain.scans, noir.scans, lit.scans]).toEqual([0, 3, 3]);
    expect(noir.score).toBeGreaterThan(plain.score + 30);
    expect(lit.score).toBeGreaterThan(plain.score + 30);
    expect(weatherEffects(allRounder, MISSIONS.M9).map((e) => e.id)).toContain('night_scan');
    // Snow swallows narrow road wheels on the climb.
    expect((await mean(MISSIONS.M9, PRESETS.deep_diver.build)).finished).toBe(0);
  }, 20000);
});
