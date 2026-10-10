import { describe, expect, it } from 'vitest';
import type { Build } from '@rivetrun/contracts';
import {
  MISSIONS, MISSION_IDS, PARTS_BY_ID, PRESETS, assessBuild, capabilities, capabilityList, compileTrack, createRun, heuristicBrain, missionDemands, partGives, partsProviding, runHeadless, step, driveSeed,
} from './index';

const allRounder = PRESETS.all_rounder.build;
const with_ = (patch: Partial<Build>): Build => ({ ...allRounder, ...patch });

describe('capabilities', () => {
  it('reads every capability from the sim data', () => {
    const c = capabilities(allRounder);
    expect(c.topSpeedMps).toBe(2);
    expect(c.tractionByTerrain.mud).toBeCloseTo(0.44, 2);
    expect(c.wadingDepthCm).toBe(35);
    expect(c.clearanceCm).toBe(7.5);
    expect(c.waterproof).toBe(false);
    expect(c.swimDepthCm).toBe(0);
    expect(c.jump).toBeNull();
    expect(c.impactProtection).toBe(0.5);
    expect(c.lookahead).toEqual({ obstacleM: 3, terrainM: 6, waterDepthM: 0 });
    expect(c.rangeM).toBeGreaterThan(500);
  });

  it('changes when the part that provides a capability is fitted', () => {
    const diver = capabilities(PRESETS.deep_diver.build);
    expect(diver.waterproof).toBe(true);
    expect(diver.swimDepthCm).toBe(120);
    expect(diver.underwaterSpeedMps).toBeGreaterThan(0);
    expect(capabilities(with_({ extras: ['thruster_kit'] })).swimDepthCm).toBe(0); // thrusters need the case
    expect(capabilities(with_({ extras: ['piston_jump'] })).jump?.cooldownS).toBe(3);
    expect(capabilities(with_({ locomotion: 'tracks' })).tractionByTerrain.ice).toBeGreaterThan(capabilities(allRounder).tractionByTerrain.ice);
    expect(capabilities(with_({ wheelSizeMm: 60 })).clearanceCm).toBeLessThan(capabilities(allRounder).clearanceCm);
    expect(capabilities(with_({ sensors: ['scout_drone'] })).lookahead.terrainM).toBe(15);
  });

  it('lists capabilities with stable ids and says what a part gives', () => {
    const ids = capabilityList(allRounder).map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('traction:mud');
    expect(partGives(allRounder, 'bumper').map((item) => item.id)).toEqual(['protection']);
    expect(partGives(PRESETS.deep_diver.build, 'thruster_kit').map((item) => item.id)).toEqual(['thrust']);
    expect(partsProviding('thrust')).toEqual(['thruster_kit']);
    expect(partsProviding('waterproof')).toContain('waterproof_case');
    expect(partsProviding('jump')).toEqual(['piston_jump']);
    expect(partsProviding('traction:ice')[0]).toBe('tracks');
  });
});

describe('missionDemands', () => {
  const labels = (id: keyof typeof MISSIONS): string[] => missionDemands(MISSIONS[id]).flatMap((segment) => segment.tests.map((test) => test.capability));

  it('names what each scenario tests', () => {
    expect(missionDemands(MISSIONS.M1)).toHaveLength(MISSIONS.M1.track.segments.length);
    expect(labels('M3')).toEqual(expect.arrayContaining(['traction:mud', 'climb', 'waterproof', 'clearance', 'protection']));
    expect(labels('M6')).toEqual(expect.arrayContaining(['thrust', 'waterproof']));
    expect(labels('M7')).toEqual(expect.arrayContaining(['jump', 'ramp_speed']));
    expect(labels('M4')).toContain('traction:ice');
  });
});

describe('assessBuild', () => {
  it('agrees with the headless run on the drive seed', async () => {
    for (const missionId of MISSION_IDS) {
      const mission = MISSIONS[missionId];
      const assessment = assessBuild(allRounder, mission);
      const { episode } = await runHeadless(mission, driveSeed(mission), allRounder, heuristicBrain);
      expect(assessment.finished, missionId).toBe(episode.outcome.finished);
      expect(assessment.score, missionId).toBe(episode.outcome.score);
      expect(assessment.segments, missionId).toHaveLength(mission.track.segments.length);
    }
  });

  it('is deterministic', () => {
    const a = assessBuild(allRounder, MISSIONS.M5);
    const b = assessBuild(allRounder, MISSIONS.M5);
    expect({ ...a, computeMs: 0 }).toEqual({ ...b, computeMs: 0 });
  });

  it('says where and why a build fails, and what it is missing', () => {
    const flooded = assessBuild(allRounder, MISSIONS.M6);
    expect(flooded.finished).toBe(false);
    expect(flooded.dnf?.reason).toBe('damage');
    expect(flooded.dnf?.missing).toEqual(expect.arrayContaining(['waterproof', 'thrust']));
    expect(flooded.segments.find((segment) => segment.verdict === 'fail')?.terrain).toBe('water');
    expect(flooded.segments.at(-1)?.verdict).toBe('not_reached');

    const noPiston = assessBuild(allRounder, MISSIONS.M7);
    expect(noPiston.dnf?.missing).toContain('jump');

    expect(assessBuild(PRESETS.deep_diver.build, MISSIONS.M6).finished).toBe(true);
  });
});

describe('obstacles are solid', () => {
  const small: Build = { locomotion: 'wheels', motor: 'motor_torque', battery: 'battery_large', sensors: ['ultrasonic'], extras: ['bumper'], wheelSizeMm: 60 };
  const rock = compileTrack(MISSIONS.M4.track).obstacles[0]!;
  const driveTo = (build: Build, action: 'cruise' | 'climb_mode', steps: number) => {
    let state = createRun({ mission: MISSIONS.M4, seed: 1, build, priority: 0.5, manual: true });
    // Start just before the first rock, on the rock segment, at rest.
    state = { ...state, sim: { ...state.sim, x: rock.xM - 0.5, terrain: 'rock' }, segmentIndex: rock.segmentIndex, bestX: rock.xM - 0.5 };
    const seen: (typeof state)[] = [];
    for (let i = 0; i < steps; i += 1) {
      state = step(state, action);
      seen.push(state);
    }
    return { state, seen };
  };

  it('stops a robot that cannot get over one, at its near face, and says so', () => {
    expect(capabilities(small).clearanceCm).toBeLessThan(rock.heightM * 100);
    const { state, seen } = driveTo(small, 'cruise', 60);
    expect(state.sim.x).toBeLessThan(rock.xM);
    expect(rock.xM - state.sim.x).toBeLessThan(0.02);
    expect(state.sim.v).toBe(0);
    expect(state.sim.blockedBy).toBe('rock');
    expect(seen.some((s) => s.lastDamage?.blocked === true && s.lastDamage.obstacle === 'rock')).toBe(true);
    expect(seen.every((s) => s.sim.x < rock.xM)).toBe(true);
  });

  it('lets climb mode, or a build with the clearance, ride over it following its height', () => {
    for (const [build, action] of [[small, 'climb_mode'], [allRounder, 'cruise']] as const) {
      const { state, seen } = driveTo(build, action, 80);
      expect(state.sim.x).toBeGreaterThan(rock.endM);
      const over = seen.filter((s) => s.sim.x >= rock.startM && s.sim.x <= rock.endM);
      expect(over.length).toBeGreaterThan(0);
      expect(Math.max(...over.map((s) => s.sim.heightM ?? 0))).toBeGreaterThan(rock.heightM * 0.5);
      expect(over.every((s) => s.sim.airborne !== true)).toBe(true);
      expect(state.sim.heightM ?? 0).toBe(0);
    }
  });

  it('keeps the wheels on the ground except when airborne, on every mission', () => {
    for (const missionId of MISSION_IDS) {
      const world = compileTrack(MISSIONS[missionId].track);
      let state = createRun({ mission: MISSIONS[missionId], seed: 1, build: PRESETS.all_rounder.build, priority: 0.5, manual: true });
      for (let i = 0; i < 4000 && !state.done; i += 1) {
        state = step(state, 'accelerate');
        const onFeature = world.obstacles.some((o) => state.sim.x >= o.startM && state.sim.x <= o.endM)
          || world.features.some((f) => (f.type === 'ramp' && state.sim.x >= f.startM && state.sim.x <= f.endM) || (f.type === 'drop' && state.sim.x <= f.startM && f.startM - state.sim.x <= 2));
        if (!state.sim.airborne && !onFeature) expect(state.sim.heightM ?? 0, `${missionId} x=${state.sim.x}`).toBe(0);
      }
    }
  });
});

describe('P2 parts', () => {
  it('lidar and ToF are obstacle rangers with the BOM range and mass', () => {
    const lidar = PARTS_BY_ID.get('lidar_rplidar_c1')!;
    const tof = PARTS_BY_ID.get('tof_vl53l1x_pololu')!;
    expect([lidar.effects.rangeM, lidar.massKg]).toEqual([12, 0.11]);
    expect([tof.effects.rangeM, tof.massKg]).toEqual([4, 0.0005]);
    expect(capabilities(with_({ sensors: ['lidar_rplidar_c1'] })).lookahead.obstacleM).toBe(12);
    expect(capabilities(with_({ sensors: ['tof_vl53l1x_pololu'] })).lookahead.obstacleM).toBe(4);
    // Two rangers on one build: the longer one counts.
    expect(capabilities(with_({ sensors: ['ultrasonic', 'lidar_rplidar_c1'] })).lookahead.obstacleM).toBe(12);
    expect(partsProviding('lookahead_obstacle')[0]).toBe('lidar_rplidar_c1');
  });

  it('the brushless motor sits between the light and the torque motor', () => {
    const speed = (motor: string): number => capabilities(with_({ motor })).topSpeedMps;
    expect(speed('brushless_motor_dfrobot_fit0441')).toBeGreaterThan(speed('motor_torque'));
    expect(speed('brushless_motor_dfrobot_fit0441')).toBeLessThan(speed('motor_light'));
    const brushless = PARTS_BY_ID.get('brushless_motor_dfrobot_fit0441')!.effects.torqueNm!;
    expect(brushless).toBeGreaterThan(PARTS_BY_ID.get('motor_light')!.effects.torqueNm!);
    expect(brushless).toBeLessThan(PARTS_BY_ID.get('motor_torque')!.effects.torqueNm!);
  });

  it('builds with the new parts run deterministically and finish M1', async () => {
    const build = with_({ motor: 'brushless_motor_dfrobot_fit0441', sensors: ['camera', 'lidar_rplidar_c1'] });
    const a = await runHeadless(MISSIONS.M1, 7, build, heuristicBrain);
    const b = await runHeadless(MISSIONS.M1, 7, build, heuristicBrain);
    expect(a.ghost).toEqual(b.ghost);
    expect(a.episode.outcome.finished).toBe(true);
    expect(a.episode.decisions.some((d) => typeof d.perceived.obstacleAheadM === 'number' && d.perceived.obstacleAheadM > 3)).toBe(true);
  });
});
