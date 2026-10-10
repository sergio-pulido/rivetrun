import { describe, expect, it } from 'vitest';
import { MISSIONS, MISSION_IDS, PARTS, PRESETS, carefulDrive, fullThrottleCheck, naiveDrive } from './index';

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
