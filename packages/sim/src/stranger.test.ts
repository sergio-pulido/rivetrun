import { describe, expect, it } from 'vitest';
import type { Action, SimState } from '@rivetrun/contracts';
import { MISSIONS, MISSION_IDS, PARTS, PRESETS, STUCK_RULES, carefulDrive, createRun, driveController, driveSeed, fullThrottleCheck, naiveDrive, score, step, wayOut } from './index';
import type { WayOut } from './index';

const allRounder = PRESETS.all_rounder.build;

describe('the stranger: full throttle and nothing else, on the default build', () => {
  it('finishes M1 with at least one star and a line a stranger understands', () => {
    const outcome = naiveDrive(allRounder, MISSIONS.M1);
    expect(outcome.finished).toBe(true);
    expect(outcome.stars).toBeGreaterThanOrEqual(1);
    // It never stops, so it misses the scan zone: the biggest thing it lost.
    expect(outcome.why).toBe('Missed the survivor: +10 s — stop on the pad for 1.5 s');
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
    // Driven off the line, then let go: now standing still counts.
    let state = createRun({ mission: MISSIONS.M1, seed: 1, build: allRounder, priority: 0.5, manual: true });
    for (let i = 0; i < 20; i += 1) state = step(state, 'accelerate');
    for (let i = 0; i < 400 && (state.sim.stuckInS === undefined || state.sim.stuckInS > 5); i += 1) state = step(state, 'coast');
    expect(state.sim.stuckInS).toBeCloseTo(5, 1);
    expect(wayOut(state)).toBe('throttle');
    // The Speedster on M3's 15° mud slope: nothing it can do climbs it.
    let wall = createRun({ mission: MISSIONS.M3, seed: driveSeed(MISSIONS.M3), build: PRESETS.speedster.build, priority: 0.5, manual: true });
    for (let i = 0; i < 900 && !wall.done && (wall.sim.stuckInS === undefined || wall.sim.stuckInS > 4); i += 1) wall = step(wall, 'accelerate');
    expect(wall.done).toBe(false);
    expect(wall.sim.stuckInS).toBeDefined();
    expect(wayOut(wall)).toBeUndefined();
  });
});

describe('a visitor reading the screen is not stuck (Q15)', () => {
  const idle = (seconds: number, manual: boolean) => {
    let state = createRun({ mission: MISSIONS.M1, seed: 1, build: allRounder, priority: 0.5, manual });
    for (let i = 0; i < seconds * 20 && !state.done; i += 1) state = step(state, 'coast');
    return state;
  };

  it('before the first throttle there is no countdown, and the run waits 30 s before ending as "never started"', () => {
    const waiting = idle(29, true);
    expect(waiting.done).toBe(false);
    expect(waiting.sim.stuckInS).toBeUndefined();
    const gaveUp = idle(31, true);
    expect(gaveUp.done).toBe(true);
    expect(gaveUp.sim.t).toBe(30);
    const outcome = score(gaveUp);
    expect(outcome.neverStarted).toBe(true);
    expect(outcome.dnfReason).toBe('stuck');
    expect(outcome.why).toBe('Never started: no throttle in the first 30 s');
  });

  it('the stuck clock starts with the first throttle: a late starter drives a normal run', () => {
    let state = idle(20, true);
    for (let i = 0; i < 2000 && !state.done; i += 1) state = step(state, 'accelerate');
    expect(state.finished).toBe(true);
    expect(score(state).neverStarted).toBeUndefined();
    // After a start, 8 s without progress is stuck as before.
    let stalled = createRun({ mission: MISSIONS.M1, seed: 1, build: allRounder, priority: 0.5, manual: true });
    for (let i = 0; i < 10; i += 1) stalled = step(stalled, 'accelerate');
    const from = stalled.sim.t;
    for (let i = 0; i < 400 && !stalled.done; i += 1) stalled = step(stalled, 'brake');
    expect(stalled.dnfReason).toBe('stuck');
    expect(stalled.sim.t - from).toBeLessThan(STUCK_RULES.afterS + 3);
    expect(score(stalled).neverStarted).toBeUndefined();
  });

  it('brains are unchanged: a brain that does nothing is stuck after 8 s', () => {
    const brain = idle(12, false);
    expect(brain.done).toBe(true);
    expect(brain.sim.t).toBe(STUCK_RULES.afterS);
    expect(score(brain).neverStarted).toBeUndefined();
  });
});

describe('no false alarm once the way out is taken (Q16)', () => {
  it('on M5, M3 and M8: full throttle, climb mode tapped when named, and the countdown never shows again before the finish', async () => {
    for (const id of ['M5', 'M3', 'M8'] as const) {
      const mission = MISSIONS[id];
      let climb = false;
      let tappedAt = -1;
      const after: SimState[] = [];
      const prompts: string[] = [];
      const controller = driveController(
        { mission, seed: driveSeed(mission), build: allRounder, priority: 0.5 },
        () => ({ throttle: 1, brake: 0, ...(climb ? { special: 'climb' as const } : {}) }),
        { hints: false, timeScale: 300, onEvent: (event) => {
          if (event.type !== 'frame') return;
          const frame = event.state;
          if (tappedAt >= 0 && frame.t > tappedAt) after.push(frame);
          if (frame.stuckInS !== undefined) prompts.push(frame.freeWith ?? 'cannot pass');
          // The player taps 1.5 s after the prompt names climb mode.
          if (!climb && frame.freeWith === 'climb' && frame.stuckInS !== undefined && frame.stuckInS <= 5) { climb = true; tappedAt = frame.t; }
        } },
      );
      const episode = await controller.start();
      expect(tappedAt, id).toBeGreaterThan(0);
      expect(episode.outcome.finished, id).toBe(true);
      expect(after.filter((frame) => frame.stuckInS !== undefined), id).toEqual([]);
      // Every prompt that was shown named climb mode: never "this build cannot pass here".
      expect([...new Set(prompts)], id).toEqual(['climb']);
    }
  }, 30000);
});
