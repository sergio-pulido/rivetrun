import { describe, expect, it } from 'vitest';
import * as sim from './index';

describe('sim public surface (scaffold)', () => {
  it('exports every function the other sessions build against', () => {
    const functions = ['createRun', 'step', 'perceive', 'lookahead', 'detectDecisionPoint', 'availableActions', 'score', 'randomBrain', 'runController', 'runHeadless'] as const;
    for (const name of functions) {
      expect(typeof sim[name], name).toBe('function');
    }
    expect(typeof sim.heuristicBrain.decide).toBe('function');
    expect(typeof sim.randomBrain(1).decide).toBe('function');
  });

  it('stubs fail loudly instead of returning fake results', async () => {
    expect(() => sim.availableActions(sim.PRESETS.all_rounder.build)).toThrow(sim.NotImplementedError);
    await expect(sim.heuristicBrain.decide({} as never)).rejects.toThrow(sim.NotImplementedError);
  });
});
