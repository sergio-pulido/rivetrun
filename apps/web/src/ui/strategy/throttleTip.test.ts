import { describe, expect, it } from 'vitest';
import { MISSIONS, PRESETS } from '@rivetrun/sim';
import { fullThrottleTip } from './sim';

describe('fullThrottleTip', () => {
  const build = PRESETS.all_rounder.build;

  it('is a sentence on what to do where holding the throttle does not finish but careful driving does', () => {
    const tips = Object.values(MISSIONS).map((mission) => [mission.id, fullThrottleTip(build, mission)] as const);
    // Every tip the sim gives is a real sentence; a mission where full throttle finishes has none.
    for (const [, tip] of tips) expect(tip === null || tip.length > 20).toBe(true);
    expect(tips.some(([, tip]) => tip !== null)).toBe(true);
    expect(fullThrottleTip(build, MISSIONS.M1)).toBeNull();
  });
});
