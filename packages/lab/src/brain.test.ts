import { describe, expect, it } from 'vitest';
import type { Build } from '@rivetrun/contracts';
import { labHeuristicBrain, labHeuristicDecide, labRandomBrain } from './brains';
import { createLabDriver, runLabEntries, runLabSync, type LabRunResult } from './controller';
import { createLab } from './engine';
import { markerCell, parseMap } from './grid';
import { buildLabQuestion, buildOptions, observeLab } from './observe';
import { LabDecisionSchema, LabQuestionSchema, type LabBrain, type LabQuestion } from './schema';
import { BASE, drive, scenarioOf, withSensors, you } from './testkit';
import type { LabScenario } from './types';

const MAZE = [
  '###########',
  '#S..#.....#',
  '#.#.#.###.#',
  '#.#...#...#',
  '#.#####.#.#',
  '#.......#E#',
  '###########',
];
const maze = scenarioOf(MAZE);
const heuristic = (scenario: LabScenario, build: Build, seed = 1): LabRunResult =>
  runLabSync(scenario, seed, [{ agentId: 'you', build, decide: labHeuristicDecide }]);
const causes = (result: LabRunResult): string[] => result.decisions.map((d) => d.trigger.cause);

describe('the brain knows only what its sensors report', () => {
  it('a blind build is told nothing about its surroundings; a lidar build is told the walls', () => {
    const blind = observeLab(createLab({ scenario: maze, seed: 1, entries: [{ agentId: 'you', build: BASE }] }), 'you');
    expect(blind.sources).toEqual(['core']);
    expect(blind.blind).toBe(true);
    expect(Object.values(blind.around).every((run) => run.free === 0 && run.then === 'unexplored')).toBe(true);
    expect(blind.unknown.join(' ')).toMatch(/no distance sensor and no camera/);
    expect(blind.tiltDeg).toBe('unknown');

    const lidar = observeLab(createLab({ scenario: maze, seed: 1, entries: [{ agentId: 'you', build: withSensors('lidar_rplidar_c1') }] }), 'you');
    expect(lidar.around.E).toEqual({ free: 2, then: 'wall' });
    expect(lidar.around.S).toEqual({ free: 4, then: 'wall' });
    expect(lidar.around.N).toEqual({ free: 0, then: 'wall' });
    expect(lidar.lines.join('\n')).toMatch(/LIDAR · north wall · east 2 free then wall · south 4 free then wall · west wall/);
    // The exit is a label: a lidar does not give it, however close.
    expect(lidar.objects).toEqual([]);
  });

  it('options are named moves with ids, and predictions come from the robot own map', () => {
    const state = createLab({ scenario: maze, seed: 1, entries: [{ agentId: 'you', build: withSensors('lidar_rplidar_c1') }] });
    const options = buildOptions(state, 'you');
    expect(options.map((o) => o.id).sort()).toEqual(['explore:E', 'explore:S']);
    expect(options.every((o) => o.kind === 'explore' && o.predicted?.steps !== undefined && o.command !== undefined)).toBe(true);
    // Blind: every direction is unexplored from the next tile on, and nothing can be predicted.
    const blind = buildOptions(createLab({ scenario: maze, seed: 1, entries: [{ agentId: 'you', build: BASE }] }), 'you');
    expect(blind.map((o) => o.id)).toEqual(['explore:N', 'explore:E', 'explore:S', 'explore:W']);
    expect(blind.every((o) => o.predicted?.steps === 0)).toBe(true);
  });

  it('every question and answer of a run passes its schema', async () => {
    const seen: LabQuestion[] = [];
    const spy: LabBrain = { decide: async (question) => { seen.push(question); return labHeuristicDecide(question); } };
    const result = await runLabEntries(maze, 1, [{ agentId: 'you', build: withSensors('camera', 'ultrasonic'), brain: spy }]);
    expect(seen.length).toBeGreaterThan(2);
    for (const question of seen) {
      const parsed = LabQuestionSchema.safeParse(question);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(LabDecisionSchema.safeParse(labHeuristicDecide(question)).success).toBe(true);
      expect(question.knew).toEqual(question.observation.lines);
    }
    expect(result.outcomes.you!.finished).toBe(true);
  });
});

describe('a decision is asked only when something changes', () => {
  it('no clock: a long empty corridor is one decision at the start and one at its end', () => {
    const corridor = scenarioOf([`#${'#'.repeat(40)}#`, `#S${'.'.repeat(38)}E#`, `#${'#'.repeat(40)}#`]);
    const result = heuristic(corridor, withSensors('ultrasonic'));
    expect(result.outcomes.you!.finished).toBe(true);
    expect(result.outcomes.you!.stats.tiles).toBe(39);
    // 39 tiles and nothing in between: the second decision is the ultrasonic finding the exit one tile ahead.
    expect(causes(result)).toEqual(['start', 'object_seen']);
  });

  it('a side opening is a junction: announced once, by the sensor that saw it', () => {
    const scenario = scenarioOf(['#########', '#S......#', '####.####', '####E####', '#########']);
    const result = heuristic(scenario, withSensors('ultrasonic'));
    const junction = result.decisions.find((d) => d.trigger.cause === 'junction_reached');
    expect(junction?.trigger).toMatchObject({ kind: 'perception', source: 'ultrasonic' });
    expect(junction?.trigger.label).toMatch(/ULTRASONIC · junction: ahead and right open/);
    expect(causes(result).filter((c) => c === 'junction_reached')).toHaveLength(1);
    expect(result.outcomes.you!.finished).toBe(true);
  });

  it('a camera announces an object the moment it comes into view, and the robot goes for it', () => {
    // The parcel is behind the wall from the start tile: it comes into view on the way.
    const map = parseMap(['#########', '#S..#.P.#', '#.......#', '#########'], { defaultTerrain: 'asphalt' });
    const scenario = scenarioOf(['#########', '#S..#.P.#', '#.......#', '#########'], {
      objects: [{ id: 'p', kind: 'parcel', label: 'Parcel A', at: markerCell(map, 'P'), destId: 'bay' }, { id: 'bay', kind: 'bay', label: 'Bay 1', at: markerCell(map, 'S'), inPlan: true }],
      objectives: [{ id: 'deliver', label: 'Deliver the parcel', type: 'deliver', kind: 'parcel' }],
    });
    const result = heuristic(scenario, withSensors('camera', 'ultrasonic'));
    expect(result.decisions.find((d) => d.trigger.cause === 'object_seen')?.trigger.label).toMatch(/^CAMERA · Parcel A, \d+ tiles/);
    expect(result.decisions.map((d) => d.choice)).toEqual(expect.arrayContaining(['goto:p', 'goto:bay']));
    expect(causes(result).filter((c) => c === 'objective_done')).toHaveLength(1);
    expect(result.events.map((e) => e.type)).toEqual(expect.arrayContaining(['picked', 'delivered']));
    expect(result.outcomes.you).toMatchObject({ status: 'complete', objectivesDone: 1, completion: 1 });
    expect(result.outcomes.you!.score).toBeGreaterThan(700);
  });

  it('battery projection: the charge left after the way back falling under 10 % asks for a decision', () => {
    const long = [`#${'#'.repeat(60)}#`, `#L${'.'.repeat(58)}S#`, `#${'#'.repeat(60)}#`];
    const map = parseMap(long, { defaultTerrain: 'sand' });
    const scenario: LabScenario = {
      ...scenarioOf(long), map, defaultTerrain: 'sand', planMap: true, tileM: 2,
      agents: [{ id: 'you', label: 'You', start: markerCell(map, 'L'), heading: 'E' }],
      objects: [{ id: 'lander', kind: 'lander', label: 'Lander', at: markerCell(map, 'L'), inPlan: true }],
      objectives: [{ id: 'back', label: 'Return to the lander', type: 'reach', target: 'lander', last: true }, { id: 'visit', label: 'Survey the far end', type: 'visit' }],
      zones: [{ id: 'far', label: 'the far end', cells: [map.width + 59] }],
    };
    const small: Build = { ...BASE, locomotion: 'wheels', battery: 'battery_small', sensors: ['ultrasonic'] };
    const states = drive(createLab({ scenario, seed: 1, entries: [{ agentId: 'you', build: small }] }), { type: 'heading', dir: 'E' });
    const low = states.find((s) => you(s).trigger?.cause === 'energy_low')!;
    expect(low).toBeDefined();
    expect(you(low).trigger).toMatchObject({ kind: 'energy', source: 'core' });
    expect(you(low).trigger!.label).toMatch(/^ENERGY · [\d.-]+ % to spare after the [\d.]+ % the way to the end costs$/);
    // It fires once (hysteresis), with charge still in the pack: the point is the way back, not the gauge.
    expect(states.filter((s) => you(s).trigger?.cause === 'energy_low')).toHaveLength(1);
    expect(you(low).batteryPct).toBeGreaterThan(30);
    // The question then offers eco pace and the way home, and the heuristic takes eco.
    const question = buildLabQuestion(low, 'you', you(low).trigger!)!;
    expect(question.options.map((o) => o.id)).toEqual(expect.arrayContaining(['pace:eco', 'goto:lander']));
    expect(question.energy.projectedPct).toBeLessThan(10);
    expect(labHeuristicDecide(question).choice).toBe('pace:eco');
  });
});

describe('sensors decide how the maze goes', () => {
  const lidar = heuristic(maze, withSensors('lidar_rplidar_c1'));
  const camera = heuristic(maze, withSensors('camera'));
  const sonar = heuristic(maze, withSensors('ultrasonic'));
  const blind = heuristic(maze, { ...BASE, extras: ['bumper'] });

  it('lidar, camera and ultrasonic builds all find the exit without touching a wall', () => {
    for (const result of [lidar, camera, sonar]) {
      expect(result.outcomes.you).toMatchObject({ status: 'complete', damagePct: 0 });
      expect(result.outcomes.you!.stats.bumps).toBe(0);
    }
  });

  it('the blind build finds its way by driving into walls, and pays for it', () => {
    const outcome = blind.outcomes.you!;
    expect(outcome.stats.bumps).toBeGreaterThan(5);
    expect(outcome.damagePct).toBeGreaterThan(0);
    expect(causes(blind).filter((c) => c === 'bumped').length).toBe(outcome.stats.bumps);
    // The bumper reports the contact; the robot is still blind to what is ahead.
    expect(blind.decisions.find((d) => d.trigger.cause === 'bumped')?.trigger).toMatchObject({ source: 'bumper', label: 'BLIND · hit a wall: no distance sensor' });
    expect(outcome.timeS).toBeGreaterThan(lidar.outcomes.you!.timeS * 1.5);
    expect(outcome.score).toBeLessThan(lidar.outcomes.you!.score);
  });

  it('seeing further means knowing sooner: the lidar finds the exit from tiles away, the ultrasonic from the next tile', () => {
    const found = (result: LabRunResult) => result.decisions.find((d) => d.trigger.cause === 'object_seen')!;
    expect(found(lidar).trigger.label).toMatch(/^LIDAR · Exit, [3-9] tiles south$/);
    expect(found(sonar).trigger.label).toBe('ULTRASONIC · Exit, 1 tiles south');
    expect(found(lidar).t).toBeLessThan(found(sonar).t);
    expect(lidar.outcomes.you!.stats.tiles).toBeLessThanOrEqual(sonar.outcomes.you!.stats.tiles);
    expect(lidar.outcomes.you!.stats.tiles).toBeLessThanOrEqual(blind.outcomes.you!.stats.tiles);
  });

  it('a lidar maps the floor but not what lies on it: with a parcel to find, the robot goes and looks', () => {
    const rows = ['#######', '#S....#', '#.###.#', '#....P#', '#######'];
    const map = parseMap(rows, { defaultTerrain: 'asphalt' });
    const scenario = scenarioOf(rows, {
      objects: [{ id: 'p', kind: 'parcel', label: 'Parcel A', at: markerCell(map, 'P'), destId: 'bay' }, { id: 'bay', kind: 'bay', label: 'Bay 1', at: markerCell(map, 'S'), inPlan: true }],
      objectives: [{ id: 'deliver', label: 'Deliver the parcel', type: 'deliver', kind: 'parcel' }],
    });
    const result = heuristic(scenario, withSensors('lidar_rplidar_c1'));
    expect(result.outcomes.you).toMatchObject({ status: 'complete' });
    // It only learns of the parcel on the parcel's own tile.
    expect(result.decisions.find((d) => d.trigger.cause === 'object_seen')?.trigger.label).toBe('CORE · Parcel A, here');
    expect(result.decisions.some((d) => /mapped but nothing has looked at/.test(JSON.stringify(d.options)) || d.choice.startsWith('explore:'))).toBe(true);
  });

  it('a random driver is the floor: the heuristic beats it on the same seed', async () => {
    const random = await runLabEntries(maze, 1, [{ agentId: 'you', build: withSensors('lidar_rplidar_c1'), brain: labRandomBrain(5) }]);
    expect(random.outcomes.you!.score).toBeLessThanOrEqual(lidar.outcomes.you!.score);
  });
});

describe('latency, misses and determinism', () => {
  const build = withSensors('camera', 'ultrasonic');
  const slow = (latencyMs: number): LabBrain => ({ decide: async (question) => ({ ...labHeuristicDecide(question), latencyMs }) });

  it('a slow answer costs time: the same choices arrive later', async () => {
    const instant = await runLabEntries(maze, 1, [{ agentId: 'you', build, brain: labHeuristicBrain }]);
    const late = await runLabEntries(maze, 1, [{ agentId: 'you', build, brain: slow(800) }]);
    expect(instant.outcomes.you!.finished && late.outcomes.you!.finished).toBe(true);
    expect(late.outcomes.you!.timeS).toBeGreaterThan(instant.outcomes.you!.timeS + 0.8);
    expect(late.decisions.every((d) => d.appliedT - d.t >= 0.8 - 1e-6)).toBe(true);
    expect(instant.decisions.every((d) => d.appliedT === d.t)).toBe(true);
  });

  it('the same seed and the same latencies give the same run; sync and async agree', async () => {
    const a = await runLabEntries(maze, 4, [{ agentId: 'you', build, brain: slow(350) }], { frameEvery: 4 });
    const b = await runLabEntries(maze, 4, [{ agentId: 'you', build, brain: slow(350) }], { frameEvery: 4 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.frames.length).toBeGreaterThan(10);
    const sync = runLabSync(maze, 4, [{ agentId: 'you', build, decide: labHeuristicDecide }]);
    const asyncRun = await runLabEntries(maze, 4, [{ agentId: 'you', build, brain: labHeuristicBrain }]);
    expect(JSON.stringify(sync.outcomes)).toBe(JSON.stringify(asyncRun.outcomes));
    expect(sync.decisions.map((d) => d.chip)).toEqual(asyncRun.decisions.map((d) => d.chip));
  });

  it('no fallback inside the sim: a brain that throws or answers off the menu is a miss, and the robot holds', async () => {
    const broken: LabBrain = { decide: async () => { throw new Error('model timed out'); } };
    const short = { ...maze, maxS: 6 };
    const thrown = await runLabEntries(short, 1, [{ agentId: 'you', build, brain: broken }]);
    expect(thrown.decisions).toEqual([]);
    expect(thrown.misses[0]).toMatchObject({ agentId: 'you', reason: 'model timed out' });
    expect(thrown.outcomes.you).toMatchObject({ status: 'dnf', dnfReason: 'timeout' });
    expect(thrown.outcomes.you!.stats.tiles).toBe(0);

    const offMenu: LabBrain = { decide: async () => ({ choice: 'fly', latencyMs: 0 }) };
    const refused = await runLabEntries(short, 1, [{ agentId: 'you', build, brain: offMenu }]);
    expect(refused.misses[0]!.reason).toBe('"fly" was not on offer');
    expect(refused.outcomes.you!.stats.tiles).toBe(0);
  });

  it('a robot is not asked more than maxDecisions times', async () => {
    let calls = 0;
    const counting: LabBrain = { decide: async (question) => { calls += 1; return labHeuristicDecide(question); } };
    await runLabEntries({ ...maze, maxS: 20 }, 1, [{ agentId: 'you', build: BASE, brain: counting }], { maxDecisions: 3 });
    expect(calls).toBe(3);
  });

  it('the decision log reads as a chip', () => {
    const result = heuristic(maze, withSensors('lidar_rplidar_c1'));
    expect(result.decisions[0]!.chip).toMatch(/^START → Explore (east|south) \(\d+ %\) · 0 ms$/);
    expect(result.decisions[0]!.options.length).toBe(2);
    expect(result.decisions[0]!.knew.join(' ')).toMatch(/CORE · battery 100 %/);
  });
});

describe('traffic, weather and two robots', () => {
  const AISLE = ['#########', '#S.....E#', '###.#####', '###.#####', '#########'];
  const forklift = { id: 'f1', label: 'Forklift', path: [{ x: 3, y: 3 }, { x: 3, y: 1 }], loop: 'bounce' as const, speedMps: 0.5, damagePct: 30 };
  const aisle = scenarioOf(AISLE, { movers: [forklift], planMap: true, objects: [{ id: 'exit', kind: 'exit', label: 'Exit', at: { x: 7, y: 1 }, inPlan: true }] });

  it('a robot that cannot see the forklift is hit by it on some seed; one with a lidar never is', () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    const blind = seeds.map((seed) => heuristic(aisle, BASE, seed).outcomes.you!);
    const sighted = seeds.map((seed) => heuristic(aisle, withSensors('lidar_rplidar_c1'), seed));
    expect(blind.some((o) => o.stats.collisions > 0)).toBe(true);
    expect(blind.find((o) => o.stats.collisions > 0)!.damagePct).toBe(30);
    expect(sighted.every((r) => r.outcomes.you!.stats.collisions === 0 && r.outcomes.you!.finished)).toBe(true);
    expect(sighted.some((r) => r.decisions.some((d) => d.trigger.cause === 'mover_seen' && /LIDAR · something moving/.test(d.trigger.label)))).toBe(true);
  });

  it('a dust storm is noticed only by a build with a camera, as a shorter range', () => {
    const storm = scenarioOf([`#${'#'.repeat(30)}#`, `#S${'.'.repeat(28)}E#`, `#${'#'.repeat(30)}#`], {
      weather: [{ id: 'storm', label: 'Dust storm', atS: 2, rangeFactor: { camera: 0.34 } }],
    });
    const camera = heuristic(storm, withSensors('camera'));
    const sonar = heuristic(storm, withSensors('ultrasonic'));
    expect(camera.decisions.find((d) => d.trigger.cause === 'visibility_changed')?.trigger.label).toBe('CAMERA · Dust storm: sees 2 tiles now');
    expect(causes(sonar)).not.toContain('visibility_changed');
    expect(camera.events.find((e) => e.type === 'weather')).toMatchObject({ label: 'Dust storm', active: true });
  });

  it('two robots, first to bring the flag home wins; a tag takes the flag from its carrier', () => {
    const rows = ['###########', '#A...F...B#', '###########'];
    const map = parseMap(rows, { defaultTerrain: 'asphalt' });
    const ctf: LabScenario = {
      ...scenarioOf(['###########', '#S...F...B#', '###########']), planMap: true, ends: 'first', tagSteals: true,
      agents: [{ id: 'you', label: 'You', start: markerCell(map, 'A'), heading: 'E' }, { id: 'jev', label: 'Jev', start: markerCell(map, 'B'), heading: 'W' }],
      objects: [
        { id: 'flag', kind: 'flag', label: 'the flag', at: markerCell(map, 'F'), destKind: 'home', inPlan: true },
        { id: 'home-you', kind: 'home', label: 'your base', at: markerCell(map, 'A'), owner: 'you', inPlan: true },
        { id: 'home-jev', kind: 'home', label: 'Jev base', at: markerCell(map, 'B'), owner: 'jev', inPlan: true },
      ],
      objectives: [{ id: 'flag', label: 'Bring the flag home', type: 'deliver', kind: 'flag' }],
    };
    const fast: Build = { ...BASE, motor: 'motor_light' };
    const result = runLabSync(ctf, 1, [{ agentId: 'you', build: fast, decide: labHeuristicDecide }, { agentId: 'jev', build: BASE, decide: labHeuristicDecide }]);
    expect(result.outcomes.you).toMatchObject({ status: 'complete' });
    expect(result.outcomes.jev).toMatchObject({ status: 'dnf', dnfReason: 'beaten' });
    expect(result.outcomes.jev!.why).toBe('The other robot got there first');

    // A tag: Jev holds the flag, the player drives into it.
    const driver = createLabDriver(ctf, 1, [{ agentId: 'you', build: fast }, { agentId: 'jev', build: BASE }]);
    driver.command('jev', { type: 'goto', to: markerCell(map, 'F'), interact: 'flag' });
    while (driver.state.agents[1]!.carrying.length === 0 && driver.state.t < 20) driver.advance();
    expect(driver.state.objects.find((o) => o.id === 'flag')).toMatchObject({ status: 'carried', by: 'jev' });
    // Just picked up, the flag is safe for 2 s: the first bump is only a bump. The player keeps at it.
    while (driver.state.agents[1]!.carrying.length > 0 && driver.state.t < 40) {
      if (driver.state.agents[0]!.command.type === 'idle') driver.command('you', { type: 'goto', to: driver.state.agents[1]!.cell });
      driver.advance();
    }
    expect(driver.result().events.filter((e) => e.type === 'bump' && e.agentId === 'you').length).toBeGreaterThanOrEqual(2);
    expect(driver.state.objects.find((o) => o.id === 'flag')).toMatchObject({ status: 'carried', by: 'you' });
    expect(driver.state.agents[0]!.carrying).toEqual(['flag']);
    expect(driver.state.agents[1]!.busy?.kind).toBe('stun');
    expect(driver.state.agents[1]!.trigger).toMatchObject({ cause: 'tagged', label: 'CORE · tagged by You: lost the flag' });
    expect(driver.result().events.find((e) => e.type === 'taken')).toMatchObject({ agentId: 'you', objectId: 'flag' });
  });

  it('ending early at the end point is a partial result, scored by the share done', () => {
    const rows = ['#######', '#L.1.2#', '#######'];
    const map = parseMap(rows, { defaultTerrain: 'asphalt' });
    const scenario: LabScenario = {
      ...scenarioOf(['#######', '#S.1.2#', '#######']), planMap: true, carryLimit: 2,
      objects: [
        { id: 'lander', kind: 'lander', label: 'Lander', at: markerCell(map, 'L'), inPlan: true },
        { id: 's1', kind: 'sample', label: 'Sample 1', at: markerCell(map, '1'), needs: ['moisture'], destKind: 'lander', inPlan: true },
        { id: 's2', kind: 'sample', label: 'Sample 2', at: markerCell(map, '2'), needs: ['moisture'], destKind: 'lander', inPlan: true },
      ],
      objectives: [{ id: 'collect', label: 'Collect 2 soil samples', type: 'collect', kind: 'sample', count: 2 }, { id: 'back', label: 'Return to the lander', type: 'reach', target: 'lander', last: true }],
    };
    const full = heuristic(scenario, withSensors('moisture_probe', 'ultrasonic'));
    expect(full.outcomes.you).toMatchObject({ status: 'complete', objectivesDone: 2 });
    // Without the probe nothing can be sampled: the only move left is to end the mission where it stands.
    const none = heuristic(scenario, withSensors('ultrasonic'));
    expect(none.outcomes.you).toMatchObject({ status: 'partial', objectivesDone: 0, completion: 0, score: 0, stars: 0 });
    // One sample, then home by hand: partial, scored by the share done.
    const driver = createLabDriver(scenario, 1, [{ agentId: 'you', build: withSensors('moisture_probe') }]);
    const run = (next: Parameters<typeof driver.command>[1]): void => {
      driver.command('you', next);
      do driver.advance(); while (!driver.done && (driver.state.agents[0]!.move !== undefined || driver.state.agents[0]!.busy !== undefined || driver.state.agents[0]!.command.type !== 'idle'));
    };
    run({ type: 'goto', to: markerCell(map, '1'), interact: 's1' });
    run({ type: 'goto', to: markerCell(map, 'L'), interact: 'lander' });
    expect(driver.state.objects.find((o) => o.id === 's1')).toMatchObject({ status: 'delivered', by: 'you' });
    run({ type: 'interact' });
    const outcome = driver.result().outcomes.you!;
    expect(outcome).toMatchObject({ status: 'partial', completion: 0.33, stars: 0 });
    expect(outcome.score).toBeGreaterThan(250);
    expect(outcome.score).toBeLessThan(full.outcomes.you!.score / 2);
  });
});
