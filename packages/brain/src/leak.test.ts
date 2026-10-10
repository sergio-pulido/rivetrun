import { describe, expect, it } from 'vitest';
import { LEAK_BUILDS, LEAK_VARIANTS, leakSamples } from '@rivetrun/sim';
import { buildArenaPrompt } from './arena/prompt';
import { buildJevRequest } from './index';

// The arena's claim, at the last step before a model reads it (OVN-SIM-21): two tracks that differ only beyond what
// the build can sense give the brain the same request, word for word. The sim's own leak.test.ts covers the question
// object; this covers the text built from it. It fails if the question builder reads anything the sensors did not report.
const MARGIN_M = 1;
const PROBE_M = 3;

describe('no leak in the question text', () => {
  for (const [name, build] of Object.entries(LEAK_BUILDS)) {
    it(`${name}: the request is identical on every variant until the difference is in range`, () => {
      const base = leakSamples(build, 'plain');
      let compared = 0;
      for (const variant of Object.keys(LEAK_VARIANTS).filter((id) => id !== 'plain')) {
        const other = leakSamples(build, variant);
        for (let i = 0; i < Math.min(base.length, other.length); i += 1) {
          const a = base[i]!;
          const reach = Math.max(a.rangeM, build.sensors.includes('moisture_probe') ? PROBE_M : 0);
          if (a.toDivergenceM <= reach + MARGIN_M) break;
          expect(JSON.stringify(buildJevRequest(other[i]!.question)), `${variant} at ${a.x.toFixed(1)} m`).toBe(JSON.stringify(buildJevRequest(a.question)));
          // The other arena contestants read the same question as plain text.
          expect(JSON.stringify(buildArenaPrompt(other[i]!.question)), `arena prompt, ${variant} at ${a.x.toFixed(1)} m`).toBe(JSON.stringify(buildArenaPrompt(a.question)));
          compared += 1;
        }
      }
      expect(compared).toBeGreaterThan(100);
    });
  }

  it('the text does change once a camera can see the difference', () => {
    const base = leakSamples(LEAK_BUILDS.camera!, 'plain');
    const mud = leakSamples(LEAK_BUILDS.camera!, 'mud');
    expect(base.some((a, i) => mud[i] !== undefined && JSON.stringify(buildJevRequest(mud[i]!.question)) !== JSON.stringify(buildJevRequest(a.question)))).toBe(true);
  });
});
