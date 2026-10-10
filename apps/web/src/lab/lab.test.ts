import { describe, expect, it } from 'vitest';
import { PRESETS } from '@rivetrun/sim';
import { LAB_DEFAULT_BUILDS, LAB_SCENARIOS, LAB_SCENARIO_IDS, LAB_SEEDS, command, createLab, labHeuristicDecide, runLabSync, stepLab, type LabState } from '@rivetrun/lab';
import { withResult } from './bests';
import { fogReport, inView, knownTiles, poseOf, trueTiles } from './boardModel';
import { LAB_HONESTY, LAB_SIMPLIFICATIONS, SCENARIO_BRIEFS, labLoadouts, resultHeading, sensorLine } from './copy';

const mine = PRESETS.speedster.build;
const start = (id: (typeof LAB_SCENARIO_IDS)[number], build = LAB_DEFAULT_BUILDS[id]): LabState =>
  createLab({ scenario: LAB_SCENARIOS[id], seed: LAB_SEEDS[0], entries: LAB_SCENARIOS[id].agents.map((agent) => ({ agentId: agent.id, build })) });
const me = (state: LabState) => state.agents[0]!;

describe('Lab Missions copy', () => {
  it('says in plain words that this is a grid simulation, and where the grid departs from the track', () => {
    expect(LAB_HONESTY).toMatch(/grid simulation/);
    expect(LAB_SIMPLIFICATIONS).toHaveLength(4);
    expect(LAB_SIMPLIFICATIONS.join(' ')).toMatch(/four tiles next to the robot/);
  });

  it('has a brief for every scenario', () => {
    for (const id of LAB_SCENARIO_IDS) {
      expect(SCENARIO_BRIEFS[id].tagline.length).toBeGreaterThan(10);
      expect(SCENARIO_BRIEFS[id].matters.length).toBeGreaterThan(0);
    }
  });

  it('names every way a run can end', () => {
    expect(resultHeading({ status: 'complete' })).toBe('Scenario complete');
    expect(resultHeading({ status: 'partial' })).toBe('Ended early');
    expect(resultHeading({ status: 'dnf', dnfReason: 'battery' })).toBe('Out of battery');
    expect(resultHeading({ status: 'dnf', dnfReason: 'damage' })).toBe('Robot wrecked');
    expect(resultHeading({ status: 'dnf', dnfReason: 'beaten' })).toBe('Jev got the flag home');
    expect(resultHeading({ status: 'dnf', dnfReason: 'stuck' })).toBe('Nothing left to do');
    expect(resultHeading({ status: 'dnf', dnfReason: 'timeout' })).toBe('Out of time');
  });

  it('offers the player their own robot, a suited one, a lidar loaner and a blind one', () => {
    const loadouts = labLoadouts('mars', mine);
    expect(loadouts.map((l) => l.id)).toEqual(['mine', 'suited', 'lidar', 'blind']);
    expect(loadouts[0]!.build).toBe(mine);
    // Mars keeps the probe in the loaner: without it no sample can be taken.
    expect(loadouts[2]!.build.sensors).toEqual(['lidar_rplidar_c1', 'moisture_probe']);
    expect(sensorLine(loadouts[3]!.build)).toBe('No sensors');
    expect(sensorLine(labLoadouts('maze', mine)[1]!.build)).toBe('Camera, Ultrasonic');
  });
});

describe('the board draws only what the robot knows', () => {
  it('fog is every tile no sensor has reported; the reveal is the whole map', () => {
    const state = start('maze', { ...LAB_DEFAULT_BUILDS.maze, sensors: [] });
    const known = knownTiles(state, me(state));
    expect(known.filter((tile) => tile.look !== 'fog')).toHaveLength(1);
    expect(known.find((tile) => tile.look !== 'fog')).toMatchObject({ x: 1, y: 1, look: 'floor', visited: true });
    const truth = trueTiles(state, me(state));
    expect(truth.every((tile) => tile.look !== 'fog')).toBe(true);
    expect(truth.filter((tile) => tile.sensed)).toHaveLength(1);
    expect(inView(state, me(state))).toHaveLength(1);
  });

  it('a camera puts a cone of tiles in view, with their ground type', () => {
    const state = start('mars');
    const view = inView(state, me(state));
    expect(view.length).toBeGreaterThan(3);
    const known = knownTiles(state, me(state));
    expect(view.every((index) => known[index]!.look !== 'fog')).toBe(true);
    expect(known.some((tile) => tile.terrain === 'sand')).toBe(true);
  });

  it('draws a robot between two tiles while it drives', () => {
    let state = command(start('maze'), 'you', { type: 'step', dir: 'S' });
    for (let i = 0; i < 4; i += 1) state = stepLab(state);
    const pose = poseOf(me(state));
    expect(pose.x).toBe(1);
    expect(pose.y).toBeGreaterThan(1);
    expect(pose.y).toBeLessThan(2);
  });

  it('reports what the sensors never saw at the end of a run', () => {
    const house = LAB_SCENARIOS.house;
    const blind = runLabSync(house, LAB_SEEDS[0], [{ agentId: 'you', build: { ...LAB_DEFAULT_BUILDS.house, sensors: [] }, decide: labHeuristicDecide }]);
    const report = fogReport(blind.final, blind.final.agents[0]!);
    expect(report.sensedPct).toBeLessThan(60);
    expect(report.missed.join(' ')).toMatch(/object/);
    expect(report.missed.join(' ')).toMatch(/the ground type on \d+ tiles/);
    const sighted = runLabSync(house, LAB_SEEDS[0], [{ agentId: 'you', build: LAB_DEFAULT_BUILDS.house, decide: labHeuristicDecide }]);
    const seen = fogReport(sighted.final, sighted.final.agents[0]!);
    expect(seen.sensedPct).toBeGreaterThan(report.sensedPct);
    expect(seen.missed.join(' ')).not.toMatch(/object/);
  });
});

describe('bests', () => {
  it('keeps the higher score per scenario', () => {
    const first = withResult({}, 'maze', { score: 500, stars: 1, timeS: 40 });
    expect(first.maze).toEqual({ score: 500, stars: 1, timeS: 40 });
    expect(withResult(first, 'maze', { score: 400, stars: 1, timeS: 30 })).toBe(first);
    expect(withResult(first, 'maze', { score: 700, stars: 3, timeS: 33 }).maze?.score).toBe(700);
    expect(withResult(first, 'ctf', { score: 100, stars: 0, timeS: 9 })).toMatchObject({ maze: { score: 500 }, ctf: { score: 100 } });
  });
});
