import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, renderVoices, type FakeNode, type Rendered } from './render.testkit';

/** The master gain in sfx.ts. The test reads the real value from the graph and checks it is this. */
const MASTER_VOLUME = 0.32;
/** The decision chirp is deliberately quiet (it was halved on request: it plays on every change of mind). */
const QUIET_BY_DESIGN = new Set(['decision']);
const MAX_SPREAD_DB = 12;

const db = (ratio: number): number => 20 * Math.log10(ratio);

describe('sound effects, rendered offline', () => {
  const rendered = new Map<string, Rendered>();
  let names: readonly string[] = [];

  beforeAll(async () => {
    vi.stubGlobal('window', {
      AudioContext: FakeAudioContext,
      localStorage: { getItem: () => null, setItem: () => undefined },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    vi.stubGlobal('navigator', { userActivation: { isActive: true } });
    const sfx = await import('./sfx');
    sfx.initAudio();
    const context = FakeAudioContext.last!;
    const master = context.destination.inputs[0] as FakeNode;
    expect(master.gain.value).toBe(MASTER_VOLUME);
    names = sfx.SOUND_NAMES;
    for (const name of sfx.SOUND_NAMES) {
      const from = context.gains.length;
      sfx.play(name);
      rendered.set(name, renderVoices(context, master, from, MASTER_VOLUME));
    }
    // The table for the QA report: `pnpm test` prints it.
    const rows = [...rendered].map(([name, r]) => `${name.padEnd(12)} peak ${r.peak.toFixed(3)} (${db(r.peak).toFixed(1)} dBFS) · ${(r.durationS * 1000).toFixed(0).padStart(4)} ms · ${r.voices} voice${r.voices === 1 ? '' : 's'}`);
    process.stdout.write(`\nsound effects, offline render\n${rows.join('\n')}\n`);
  });

  it('covers every sound name', () => {
    expect(names.length).toBe(20);
    expect(new Set(names).size).toBe(names.length);
  });

  it('each one makes sound', () => {
    for (const [name, r] of rendered) {
      expect(r.voices, name).toBeGreaterThan(0);
      expect(r.peak, name).toBeGreaterThan(0.01);
    }
  });

  it('none clips after the master gain', () => {
    for (const [name, r] of rendered) expect(r.peak, name).toBeLessThanOrEqual(1);
  });

  it('each is shorter than 2 s', () => {
    for (const [name, r] of rendered) expect(r.durationS, name).toBeLessThan(2);
  });

  it(`the loudest is at most ${MAX_SPREAD_DB} dB above the quietest`, () => {
    const peaks = [...rendered].filter(([name]) => !QUIET_BY_DESIGN.has(name)).map(([, r]) => r.peak);
    expect(db(Math.max(...peaks) / Math.min(...peaks))).toBeLessThanOrEqual(MAX_SPREAD_DB);
  });

  it('the decision chirp is the quietest, and not lost: within 18 dB of the loudest', () => {
    const decision = rendered.get('decision')!.peak;
    const peaks = [...rendered.values()].map((r) => r.peak);
    expect(decision).toBe(Math.min(...peaks));
    expect(db(Math.max(...peaks) / decision)).toBeLessThanOrEqual(18);
  });
});
