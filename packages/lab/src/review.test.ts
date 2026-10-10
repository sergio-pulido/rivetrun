// Regressions from the code review of the engine and the driver.
import { describe, expect, it } from 'vitest';
import type { Build } from '@rivetrun/contracts';
import { labHeuristicDecide } from './brains';
import { createLabDriver, runLabEntries, runLabSync } from './controller';
import { createLab } from './engine';
import { indexOf, markerCell, parseMap } from './grid';
import { observeLab } from './observe';
import type { LabBrain } from './schema';
import { BASE, drive, last, scenarioOf, withSensors, you } from './testkit';
import type { LabScenario } from './types';

const heuristic = (scenario: LabScenario, build: Build, seed = 1) => runLabSync(scenario, seed, [{ agentId: 'you', build, decide: labHeuristicDecide }]);

describe('review fixes', () => {
  it('a robot held up by traffic that does not clear is asked again, not left standing', () => {
    const rows = ['############', '#S........E#', '############'];
    const scenario = scenarioOf(rows, {
      planMap: true, maxS: 20,
      objects: [{ id: 'exit', kind: 'exit', label: 'Exit', at: { x: 10, y: 1 }, inPlan: true }],
      movers: [{ id: 'f', label: 'Forklift', path: [{ x: 3, y: 1 }, { x: 9, y: 1 }], loop: 'bounce', speedMps: 1, damagePct: 30 }],
    });
    const result = heuristic(scenario, withSensors('lidar_rplidar_c1'));
    const held = result.decisions.filter((d) => d.trigger.cause === 'mover_ahead');
    expect(held.length).toBeGreaterThanOrEqual(3);
    expect(held.some((d) => d.trigger.label === 'CORE · still held up by traffic')).toBe(true);
    // The forklift never clears a corridor one tile wide: the polite robot is not hit, and does not get through.
    expect(result.outcomes.you).toMatchObject({ status: 'dnf', dnfReason: 'timeout', damagePct: 0 });
  });

  it('with the floor plan known, a parcel that is not on the plan can still be searched for', () => {
    const rows = ['#######', '#S....#', '#.###.#', '#....P#', '#######'];
    const map = parseMap(rows, { defaultTerrain: 'asphalt' });
    const scenario = scenarioOf(rows, {
      planMap: true,
      objects: [{ id: 'p', kind: 'parcel', label: 'Parcel A', at: markerCell(map, 'P'), destId: 'bay' }, { id: 'bay', kind: 'bay', label: 'Bay 1', at: markerCell(map, 'S'), inPlan: true }],
      objectives: [{ id: 'deliver', label: 'Deliver the parcel', type: 'deliver', kind: 'parcel' }],
    });
    for (const build of [withSensors('lidar_rplidar_c1'), withSensors('camera'), BASE]) {
      const result = heuristic(scenario, build);
      expect(result.outcomes.you, build.sensors.join('+') || 'blind').toMatchObject({ status: 'complete' });
      expect(result.decisions[0]!.options.some((o) => o.id.startsWith('explore:'))).toBe(true);
    }
  });

  it('a trigger is kept until it is asked about: stepping twice before asking, or asking twice, loses and repeats nothing', () => {
    const scenario = scenarioOf(['#########', '#S.....E#', '#########']);
    const brain: LabBrain = { decide: async (question) => labHeuristicDecide(question) };
    const driver = createLabDriver(scenario, 1, [{ agentId: 'you', build: withSensors('ultrasonic'), brain }]);
    driver.advance();
    driver.advance();
    const first = driver.questions();
    expect(first.map((q) => q.question.trigger.cause)).toEqual(['start']);
    expect(driver.questions()).toEqual([]);
    driver.answer('you', labHeuristicDecide(first[0]!.question));
    driver.advance();
    expect(driver.questions()).toEqual([]);
  });

  it('an energy warning that fires while a slow brain is thinking is still asked about', async () => {
    const long = [`#${'#'.repeat(60)}#`, `#L${'.'.repeat(58)}S#`, `#${'#'.repeat(60)}#`];
    const map = parseMap(long, { defaultTerrain: 'sand' });
    const scenario: LabScenario = {
      ...scenarioOf(long), map, defaultTerrain: 'sand', planMap: true, tileM: 2,
      agents: [{ id: 'you', label: 'You', start: markerCell(map, 'L'), heading: 'E' }],
      objects: [{ id: 'lander', kind: 'lander', label: 'Lander', at: markerCell(map, 'L'), inPlan: true }],
      objectives: [{ id: 'back', label: 'Return to the lander', type: 'reach', target: 'lander', last: true }, { id: 'visit', label: 'Survey the far end', type: 'visit' }],
      zones: [{ id: 'far', label: 'the far end', cells: [map.width + 59] }],
    };
    // A stubborn, slow driver: it heads for the far end whatever the numbers say, and takes 2.5 s over every answer.
    const slow: LabBrain = {
      decide: async (question) => ({ ...labHeuristicDecide(question), ...(question.options.some((o) => o.id === 'goto:zone:far') ? { choice: 'goto:zone:far' } : {}), latencyMs: 2500 }),
    };
    const result = await runLabEntries(scenario, 1, [{ agentId: 'you', build: { ...BASE, locomotion: 'wheels', battery: 'battery_small', sensors: ['ultrasonic'] }, brain: slow }]);
    const low = result.decisions.find((d) => d.trigger.cause === 'energy_low');
    expect(low).toBeDefined();
    expect(low!.options.some((o) => o.id === 'pace:eco')).toBe(true);
  });

  it('the edge of the map is on the plan: stepping off it does nothing, and costs nothing', () => {
    const scenario = scenarioOf(['..S', '#.E']);
    const state = createLab({ scenario, seed: 1, entries: [{ agentId: 'you', build: BASE }] });
    for (const dir of ['E', 'N'] as const) {
      const after = last(drive(state, { type: 'step', dir }));
      expect(you(after).cell).toEqual({ x: 2, y: 0 });
      expect(you(after).stats.bumps).toBe(0);
      expect(you(after).damagePct).toBe(0);
    }
    expect(you(state).known[indexOf(scenario.map, { x: 0, y: 1 })]).toBeUndefined();
  });

  it('weather in force from the start is not announced as a change; its end is', () => {
    const scenario = scenarioOf([`#${'#'.repeat(30)}#`, `#S${'.'.repeat(28)}E#`, `#${'#'.repeat(30)}#`], {
      weather: [{ id: 'fog', label: 'Fog', atS: 0, untilS: 2, rangeFactor: { camera: 0.34 } }],
    });
    const result = heuristic(scenario, withSensors('camera'));
    const changes = result.decisions.filter((d) => d.trigger.cause === 'visibility_changed');
    expect(changes).toHaveLength(1);
    expect(changes[0]!.t).toBeGreaterThanOrEqual(2);
    expect(changes[0]!.trigger.label).toBe('CAMERA · Fog: sees 6 tiles now');
  });

  it('a build without an IMU or a camera does not learn it is standing on a ramp', () => {
    const scenario = scenarioOf(['######', '#S^.E#', '######'], {}, 10);
    const onRamp = (build: Build) => {
      const state = last(drive(createLab({ scenario, seed: 1, entries: [{ agentId: 'you', build }] }), { type: 'step', dir: 'E' }));
      return { tile: you(state).known[indexOf(scenario.map, { x: 2, y: 1 })], tilt: observeLab(state, 'you').tiltDeg };
    };
    expect(onRamp(BASE).tile).toMatchObject({ kind: 'floor', visited: true });
    expect(onRamp(BASE).tile?.slopeDeg).toBeUndefined();
    expect(onRamp(BASE).tilt).toBe('unknown');
    expect(onRamp(withSensors('imu')).tile).toMatchObject({ kind: 'ramp', slopeDeg: 10 });
    expect(onRamp(withSensors('imu')).tilt).toBe(10);
  });

  it('stepping on after the run is over adds nothing to the record', () => {
    const scenario = scenarioOf(['#####', '#S.E#', '#####']);
    const driver = createLabDriver(scenario, 1, [{ agentId: 'you', build: BASE }]);
    driver.command('you', { type: 'heading', dir: 'E' });
    while (!driver.done) driver.advance();
    const events = driver.result().events.length;
    const t = driver.state.t;
    driver.advance();
    driver.advance();
    expect(driver.result().events.length).toBe(events);
    expect(driver.state.t).toBe(t);
  });
});
