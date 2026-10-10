import { describe, expect, it } from 'vitest';
import type { Build } from '@rivetrun/contracts';
import { labHeuristicBrain, labHeuristicDecide, labRandomBrain } from '../brains';
import { runLabSync, type LabRunResult } from '../controller';
import { expandRoute, indexOf, inside, sameCell, tileAt } from '../grid';
import { hasRole } from '../objectives';
import { LabQuestionSchema, type LabBrain, type LabDecision, type LabQuestion } from '../schema';
import type { LabOutcome } from '../score';
import { LAB_DEFAULT_BUILDS, LAB_RIVAL_LATENCY_MS, LAB_SCENARIOS, LAB_SCENARIO_IDS, LAB_SEEDS, runLabHeadless, type LabScenarioId } from './index';

const BASE: Build = { locomotion: 'offroad_wheels', motor: 'motor_torque', battery: 'battery_large', sensors: [], extras: [] };
const withSensors = (...sensors: string[]): Build => ({ ...BASE, sensors });

/** The heuristic on every robot, answering at once. */
const play = (id: LabScenarioId, build: Build, seed: number = LAB_SEEDS[0]): LabRunResult =>
  runLabSync(LAB_SCENARIOS[id], seed, LAB_SCENARIOS[id].agents.map((agent) => ({ agentId: agent.id, build, decide: labHeuristicDecide })));
const you = (id: LabScenarioId, build: Build, seed?: number): LabOutcome => play(id, build, seed).outcomes.you!;
const everySeed = (id: LabScenarioId, build: Build): LabOutcome[] => LAB_SEEDS.map((seed) => you(id, build, seed));

describe('the five Lab Missions are well formed', () => {
  it('lists maze, warehouse, mars, house and ctf, each with a build and a clear objective', () => {
    expect([...LAB_SCENARIO_IDS]).toEqual(['maze', 'warehouse', 'mars', 'house', 'ctf']);
    for (const id of LAB_SCENARIO_IDS) {
      const scenario = LAB_SCENARIOS[id];
      expect(scenario.id).toBe(id);
      expect(scenario.objectives.length).toBeGreaterThan(0);
      expect(scenario.description.length).toBeGreaterThan(40);
      expect(scenario.agents[0]!.id).toBe('you');
      expect(LAB_DEFAULT_BUILDS[id]).toBeDefined();
    }
    expect(LAB_SCENARIOS.ctf.agents.map((a) => a.id)).toEqual(['you', 'jev']);
  });

  it('puts every start, object and forklift route on floor, and no forklift on a start tile', () => {
    for (const id of LAB_SCENARIO_IDS) {
      const { map, agents, objects, movers, zones } = LAB_SCENARIOS[id];
      const floor = (cell: { x: number; y: number }): boolean => inside(map, cell) && tileAt(map, cell).kind === 'floor';
      for (const agent of agents) expect(floor(agent.start), `${id} start`).toBe(true);
      for (const object of objects) expect(floor(object.at), `${id} ${object.id}`).toBe(true);
      for (const mover of movers) {
        const route = expandRoute(mover.path, mover.loop);
        expect(route.every(floor), `${id} ${mover.id}`).toBe(true);
        expect(route.some((cell) => agents.some((agent) => sameCell(agent.start, cell))), `${id} ${mover.id} on a start`).toBe(false);
      }
      for (const zone of zones) expect(zone.cells.length, `${id} ${zone.id}`).toBeGreaterThan(8);
      // Every item has somewhere to go, and every destination exists.
      for (const item of objects.filter((o) => o.destId !== undefined)) expect(objects.some((o) => o.id === item.destId && hasRole(o, 'depot'))).toBe(true);
    }
    const maze = LAB_SCENARIOS.maze;
    expect(maze.objects[0]!.at.x).toBe(maze.map.width - 1);
    expect(LAB_SCENARIOS.house.zones.map((z) => z.id)).toEqual(['kitchen', 'living', 'bedroom', 'study']);
    // Three stairs: two in the hallway, one in the study next to its checkpoint.
    const house = LAB_SCENARIOS.house;
    expect(house.map.tiles.filter((tile) => tile.kind === 'drop')).toHaveLength(3);
    const study = house.zones.find((z) => z.id === 'study')!;
    expect(study.cells.filter((index) => house.map.tiles[index]!.kind === 'drop')).toHaveLength(1);
    expect(house.zones.some((z) => z.cells.includes(indexOf(house.map, house.agents[0]!.start)))).toBe(false);
  });

  it('the default build completes every scenario on every seed, in few decisions', () => {
    for (const id of LAB_SCENARIO_IDS) {
      for (const seed of LAB_SEEDS) {
        const result = play(id, LAB_DEFAULT_BUILDS[id], seed);
        expect(result.outcomes.you, `${id} seed ${seed}`).toMatchObject({ status: 'complete', completion: 1 });
        expect(result.outcomes.you!.stars, `${id} seed ${seed}`).toBeGreaterThanOrEqual(1);
        // A model is called once per decision: keep a run affordable.
        expect(result.decisions.filter((d) => d.agentId === 'you').length, `${id} decisions`).toBeLessThan(30);
        expect(result.misses).toEqual([]);
      }
    }
  });
});

describe('Maze: what the robot can sense decides how much of it gets driven', () => {
  const lidar = you('maze', withSensors('lidar_rplidar_c1'));
  const camera = you('maze', withSensors('camera'));
  const sonar = you('maze', withSensors('ultrasonic'));

  it('lidar drives the least, then the camera, then the ultrasonic; none of them touches a wall', () => {
    expect(lidar.stats.tiles).toBeLessThan(camera.stats.tiles - 5);
    expect(camera.stats.tiles).toBeLessThan(sonar.stats.tiles - 20);
    expect([lidar, camera, sonar].every((o) => o.finished && o.stats.bumps === 0 && o.damagePct === 0)).toBe(true);
    expect(lidar.score).toBeGreaterThan(camera.score);
    expect(camera.score).toBeGreaterThan(sonar.score);
  });

  it('a blind robot is wrecked on the walls; with a bumper it gets out, slowly and battered', () => {
    const bare = you('maze', BASE);
    const padded = you('maze', { ...BASE, extras: ['bumper'] });
    expect(bare).toMatchObject({ status: 'dnf', dnfReason: 'damage' });
    expect(bare.why).toMatch(/^Wrecked: \d+ bumps$/);
    expect(padded.finished).toBe(true);
    expect(padded.stats.bumps).toBeGreaterThan(30);
    expect(padded.damagePct).toBeGreaterThan(10);
    expect(padded.timeS).toBeGreaterThan(sonar.timeS * 1.5);
  });
});

describe('Warehouse: forklifts, the order of the jobs and a battery budget', () => {
  const hits = (build: Build): number => everySeed('warehouse', build).reduce((sum, outcome) => sum + outcome.stats.collisions, 0);

  it('the more a build sees of the forklifts, the less it is hit: lidar, then camera, then none', () => {
    const lidar = everySeed('warehouse', withSensors('lidar_rplidar_c1'));
    expect(lidar.every((outcome) => outcome.status === 'complete')).toBe(true);
    // Shelves hide a cross-aisle until the robot is at its mouth: even a lidar is caught now and then.
    expect(hits(withSensors('lidar_rplidar_c1'))).toBeLessThan(hits(withSensors('camera')));
    expect(hits(withSensors('camera'))).toBeLessThan(hits(BASE));
  });

  it('a build that cannot see the forklifts is hit on every seed, and wrecked on some', () => {
    const blind = everySeed('warehouse', BASE);
    expect(blind.every((outcome) => outcome.stats.collisions >= 1)).toBe(true);
    expect(blind.some((outcome) => outcome.status === 'dnf' && outcome.dnfReason === 'damage')).toBe(true);
  });

  it('each pickup is predicted as a whole job and as the start of the whole tour, and the heuristic starts with the best one', () => {
    const result = play('warehouse', LAB_DEFAULT_BUILDS.warehouse);
    const first = result.decisions[0]!;
    // Parcel 2 is the nearest. It is also the right one to start with, but for the tour it leaves, not for being near.
    const picks = first.options.filter((o) => o.id.startsWith('goto:parcel-'));
    expect(picks.map((o) => o.id).sort()).toEqual(['goto:parcel-1', 'goto:parcel-2', 'goto:parcel-3']);
    expect(first.choice).toBe('goto:parcel-2');
    const order = result.decisions.map((d) => d.choice).filter((choice) => choice.startsWith('goto:parcel-'));
    expect([...new Set(order)]).toEqual(['goto:parcel-2', 'goto:parcel-3', 'goto:parcel-1']);
  });

  it('the small battery does not cover the three round trips', () => {
    for (const outcome of everySeed('warehouse', { ...BASE, battery: 'battery_small', sensors: ['lidar_rplidar_c1'] })) {
      expect(outcome).toMatchObject({ status: 'dnf', dnfReason: 'battery' });
      expect(outcome.completion).toBeGreaterThan(0);
      expect(outcome.completion).toBeLessThan(1);
    }
  });
});

describe('Mars: the probe, the battery and the storm', () => {
  it('without the moisture probe no sample can be taken: the mission ends where it started', () => {
    expect(you('mars', withSensors('camera', 'lidar_rplidar_c1'))).toMatchObject({ status: 'partial', completion: 0, score: 0 });
  });

  it('camera and probe: three samples and back, with charge to spare and no damage', () => {
    for (const outcome of everySeed('mars', withSensors('camera', 'moisture_probe'))) {
      expect(outcome).toMatchObject({ status: 'complete', damagePct: 0, objectivesDone: 2 });
      expect(outcome.energyUsedPct).toBeGreaterThan(35);
      expect(outcome.energyUsedPct).toBeLessThan(80);
    }
  });

  it('a lidar cannot see a crater: the robot drives into one', () => {
    const outcome = you('mars', withSensors('lidar_rplidar_c1', 'moisture_probe'));
    expect(outcome.stats.falls).toBeGreaterThanOrEqual(1);
    expect(outcome.damagePct).toBeGreaterThanOrEqual(25);
  });

  it('the small battery cannot bring three samples home', () => {
    const outcomes = everySeed('mars', { ...BASE, battery: 'battery_small', sensors: ['camera', 'moisture_probe'] });
    expect(outcomes.every((o) => o.status !== 'complete')).toBe(true);
    expect(outcomes.some((o) => o.status === 'partial' && o.completion > 0)).toBe(true);
  });

  it('the dust storm reaches a camera build as a decision: it sees one tile', () => {
    const result = play('mars', LAB_DEFAULT_BUILDS.mars);
    expect(result.decisions.find((d) => d.trigger.cause === 'visibility_changed')?.trigger.label).toBe('CAMERA · Dust storm: sees 1 tiles now');
  });
});

describe('House: rooms, checkpoints and stairs', () => {
  it('a camera build visits the four rooms and scans the four checkpoints without a fall', () => {
    const result = play('house', withSensors('camera'));
    expect(result.outcomes.you).toMatchObject({ status: 'complete', damagePct: 0 });
    expect(result.outcomes.you!.stats.falls).toBe(0);
    expect(result.events.filter((e) => e.type === 'scanned')).toHaveLength(4);
    expect(result.events.filter((e) => e.type === 'zone').length).toBeGreaterThanOrEqual(3);
    expect(result.events.some((e) => e.type === 'door')).toBe(true);
  });

  it('without a camera nothing can be scanned: the rooms get visited and that is all', () => {
    const outcome = you('house', withSensors('lidar_rplidar_c1'));
    expect(outcome).toMatchObject({ status: 'dnf', dnfReason: 'stuck', objectivesDone: 1, completion: 0.5 });
  });

  it('an ultrasonic does not see the stairs: the robot falls down them', () => {
    const outcome = you('house', withSensors('ultrasonic'));
    expect(outcome.stats.falls).toBeGreaterThanOrEqual(1);
    expect(outcome.damagePct).toBeGreaterThanOrEqual(25);
  });
});

describe('Capture the flag and the headless run', () => {
  const build = LAB_DEFAULT_BUILDS.ctf;

  it('runs a scenario by id and returns the outcome of the robot under test', async () => {
    const result = await runLabHeadless('maze', LAB_SEEDS[0], LAB_DEFAULT_BUILDS.maze, labHeuristicBrain);
    expect(result.outcome).toBe(result.outcomes.you);
    expect(result.outcome).toMatchObject({ status: 'complete', finished: true });
    expect(result.scenarioId).toBe('maze');
    await expect(runLabHeadless('moon' as LabScenarioId, 1, build, labHeuristicBrain)).rejects.toThrow(/unknown scenario "moon"/);
  });

  it('the same seed, answers and latencies give the same run', async () => {
    const a = await runLabHeadless('warehouse', LAB_SEEDS[1], LAB_DEFAULT_BUILDS.warehouse, labHeuristicBrain);
    const b = await runLabHeadless('warehouse', LAB_SEEDS[1], LAB_DEFAULT_BUILDS.warehouse, labHeuristicBrain);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('a brain that answers faster than the rival wins the flag; one that is slower loses it', async () => {
    const answering = (latencyMs: number): LabBrain => ({ decide: async (question) => ({ ...labHeuristicDecide(question), latencyMs }) });
    const quick = await runLabHeadless('ctf', LAB_SEEDS[0], build, answering(LAB_RIVAL_LATENCY_MS - 300));
    const slow = await runLabHeadless('ctf', LAB_SEEDS[0], build, answering(LAB_RIVAL_LATENCY_MS + 600));
    expect(quick.outcome).toMatchObject({ status: 'complete' });
    expect(quick.outcomes.jev).toMatchObject({ status: 'dnf', dnfReason: 'beaten' });
    expect(slow.outcome).toMatchObject({ status: 'dnf', dnfReason: 'beaten' });
    expect(slow.outcomes.jev).toMatchObject({ status: 'complete' });
    expect(quick.events.filter((e) => e.type === 'delivered')).toHaveLength(1);
  });

  it('the rival is in the fog until a sensor picks it up, and who holds the flag is public', async () => {
    const questions: Parameters<LabBrain['decide']>[0][] = [];
    const spy: LabBrain = { decide: async (question) => { questions.push(question); return { ...labHeuristicDecide(question), latencyMs: 900 }; } };
    const result = await runLabHeadless('ctf', LAB_SEEDS[0], build, spy);
    expect(questions[0]!.observation.moving).toEqual([]);
    expect(questions.every((q) => LabQuestionSchema.safeParse(q).success)).toBe(true);
    expect(questions.some((q) => q.knew.includes('CORE · Jev holds the flag'))).toBe(true);
    expect(result.decisions.filter((d) => d.agentId === 'you').some((d) => d.options.some((o) => o.id === 'tag:jev' || o.id === 'goto:home-jev'))).toBe(true);
  });
});

describe('the score tells good choices from bad ones', () => {
  const SEEDS = [1001, 1002, 1003, 1004, 1005, 1006];
  const mean = (scores: number[]): number => scores.reduce((sum, score) => sum + score, 0) / scores.length;

  it('on every scenario the heuristic beats a random driver by a wide margin', async () => {
    for (const id of LAB_SCENARIO_IDS) {
      const build = LAB_DEFAULT_BUILDS[id];
      const heuristic = mean(await Promise.all(LAB_SEEDS.map(async (seed) => (await runLabHeadless(id, seed, build, labHeuristicBrain)).outcome.score)));
      const random = mean(await Promise.all(LAB_SEEDS.flatMap((seed) => [0, 1].map(async (k) => (await runLabHeadless(id, seed, build, labRandomBrain(seed * 31 + k))).outcome.score))));
      expect(heuristic - random, `${id}: heuristic ${Math.round(heuristic)} vs random ${Math.round(random)}`).toBeGreaterThan(150);
    }
  }, 60000);

  it('Warehouse: no fixed order of the three parcels beats the heuristic by more than 20 points', () => {
    const scenario = LAB_SCENARIOS.warehouse;
    const build = LAB_DEFAULT_BUILDS.warehouse;
    const run = (decide: (question: LabQuestion) => LabDecision): number =>
      mean(SEEDS.map((seed) => runLabSync(scenario, seed, [{ agentId: 'you', build, decide }]).outcomes.you!.score));
    const heuristic = run(labHeuristicDecide);
    const fixed = (order: string) => (question: LabQuestion): LabDecision => {
      const act = question.options.find((o) => o.kind === 'interact') ?? question.options.find((o) => o.id.startsWith('goto:bay-'));
      const pick = [...order].map((digit) => `goto:parcel-${digit}`).find((id) => question.options.some((o) => o.id === id));
      return { ...labHeuristicDecide(question), choice: act?.id ?? pick ?? labHeuristicDecide(question).choice };
    };
    const orders = ['123', '132', '213', '231', '312', '321'].map((order) => ({ order, score: run(fixed(order)) }));
    const best = orders.reduce((a, b) => (b.score > a.score ? b : a));
    expect(heuristic, `heuristic ${Math.round(heuristic)}; best fixed order ${best.order} ${Math.round(best.score)}`).toBeGreaterThanOrEqual(best.score - 20);
    // The order matters: the worst is far behind the best.
    expect(best.score - Math.min(...orders.map((o) => o.score))).toBeGreaterThan(100);
  }, 60000);
});
