import { describe, expect, it } from 'vitest';
import type { Action } from '@rivetrun/contracts';
import { MISSIONS, MISSION_IDS, PARTS, PRESETS, STUCK_RULES, carefulDrive, createRun, driveSeed, fullThrottleCheck, naiveDrive, score, step, wayOut } from './index';
import type { WayOut } from './index';

const allRounder = PRESETS.all_rounder.build;

describe('the stranger: full throttle and nothing else, on the default build', () => {
  it('finishes M1 with at least one star and a line a stranger understands', () => {
    const outcome = naiveDrive(allRounder, MISSIONS.M1);
    expect(outcome.finished).toBe(true);
    expect(outcome.stars).toBeGreaterThanOrEqual(1);
    expect(outcome.why).toBe('Hit the step at 2 m/s');
  });

  it('never gets stuck on M1 at full throttle, whatever the preset or the drive train', () => {
    for (const preset of Object.values(PRESETS)) expect(naiveDrive(preset.build, MISSIONS.M1).finished, preset.id).toBe(true);
    const ids = (slot: string): string[] => PARTS.filter((part) => part.slot === slot && !part.comingSoon).map((part) => part.id);
    for (const locomotion of ids('locomotion')) for (const motor of ids('motor')) for (const battery of ids('battery')) {
      const build = { locomotion, motor, battery, sensors: [], extras: [] };
      expect(naiveDrive(build, MISSIONS.M1).finished, `${locomotion}/${motor}/${battery}`).toBe(true);
    }
  });

  it('every mission it does not finish has a tip that says what to do, or is a build problem careful driving cannot fix', () => {
    const tips: Record<string, string | undefined> = {};
    for (const id of MISSION_IDS) {
      const check = fullThrottleCheck(allRounder, MISSIONS[id]);
      expect(check.finishes).toBe(naiveDrive(allRounder, MISSIONS[id]).finished);
      if (check.finishes) expect(check.tip, id).toBeUndefined();
      else if (check.drivable) expect(check.tip, id).toMatch(/climb mode|ease off/);
      else expect(carefulDrive(allRounder, MISSIONS[id]).finished, id).toBe(false);
      tips[id] = check.tip;
    }
    expect(Object.entries(tips).filter(([, tip]) => tip !== undefined).map(([id]) => id)).toEqual(['M3', 'M5', 'M8']);
    expect(tips.M3).toBe('Full throttle all the way does not finish this one. Stuck on a 15° mud slope — it needs climb mode, a winch or more grip.');
  });
});

describe('bogged down: a countdown and a way out (OVN-SIM-13)', () => {
  /** Full throttle; once the countdown shows, optionally press what the sim names (climb mode stays on, as the button does). */
  const drive = (id: 'M3' | 'M5' | 'M8', follow: boolean) => {
    const mission = MISSIONS[id];
    let state = createRun({ mission, seed: driveSeed(mission), build: allRounder, priority: 0.5, manual: true });
    let action: Action = 'accelerate';
    let firstSlipT = -1;
    let firstWarnT = -1;
    const named: WayOut[] = [];
    while (!state.done) {
      state = step(state, action);
      if (firstSlipT < 0 && state.slipPct > 25) firstSlipT = state.sim.t;
      if (state.sim.stuckInS === undefined) continue;
      if (firstWarnT < 0) firstWarnT = state.sim.t;
      // The player needs a moment: they press 1.5 s after the prompt appears.
      if (!follow || state.sim.stuckInS > STUCK_RULES.afterS - STUCK_RULES.warnS - 1.5) continue;
      const command = wayOut(state);
      if (!command) continue;
      if (named.at(-1) !== command) named.push(command);
      action = command === 'climb' ? 'climb_mode' : command === 'ease' ? 'slow_down' : command === 'winch' ? 'deploy_winch' : 'accelerate';
    }
    return { outcome: score(state), firstSlipT, firstWarnT, endT: state.sim.t, named };
  };

  it('on M5 the full-throttle driver gets over 4 s between the first slip and "stuck", with the countdown showing', () => {
    const naive = drive('M5', false);
    expect(naive.outcome.finished).toBe(false);
    expect(naive.outcome.dnfReason).toBe('stuck');
    expect(naive.endT - naive.firstSlipT).toBeGreaterThanOrEqual(4);
    expect(naive.endT - naive.firstWarnT).toBeGreaterThanOrEqual(4);
  });

  it('pressing the named command inside that window finishes M5, M3 and M8 with the default build', () => {
    for (const id of ['M5', 'M3', 'M8'] as const) {
      const helped = drive(id, true);
      expect(helped.named, id).toEqual(['climb']);
      expect(helped.outcome.finished, id).toBe(true);
    }
  });

  it('names nothing when no command frees the build, and counts down while the robot stands still', () => {
    let state = createRun({ mission: MISSIONS.M1, seed: 1, build: allRounder, priority: 0.5, manual: true });
    for (let i = 0; i < 60; i += 1) state = step(state, 'coast');
    expect(state.sim.stuckInS).toBeCloseTo(STUCK_RULES.afterS - 3, 1);
    expect(wayOut(state)).toBe('throttle');
    // The Speedster on M3's 15° mud slope: nothing it can do climbs it.
    let wall = createRun({ mission: MISSIONS.M3, seed: driveSeed(MISSIONS.M3), build: PRESETS.speedster.build, priority: 0.5, manual: true });
    for (let i = 0; i < 900 && !wall.done && (wall.sim.stuckInS === undefined || wall.sim.stuckInS > 4); i += 1) wall = step(wall, 'accelerate');
    expect(wall.done).toBe(false);
    expect(wall.sim.stuckInS).toBeDefined();
    expect(wayOut(wall)).toBeUndefined();
  });
});
