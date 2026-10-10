import { describe, expect, it } from 'vitest';
import { arenaLine, arenaRows, parseArena, scatter } from './arena';

const FILE = {
  date: '2026-10-10',
  runs: 126,
  promptHash: 'ab12cd3',
  missions: ['M1', 'M2'],
  contestants: [
    { id: 'jev', label: 'Jev', kind: 'jev', status: 'ok', runs: 21, finishPct: 90.5, meanScore: 780.4, decisionsPerRun: 9.42, latencyP50Ms: 340, latencyP95Ms: 1280, lateCrashes: 1 },
    { id: 'heuristic', label: 'Heuristic', kind: 'heuristic', status: 'ok', runs: 21, finishPct: 71, meanScore: 640, decisionsPerRun: 9, latencyP50Ms: 0, latencyP95Ms: 0, lateCrashes: 0, costPerRunUsd: 0 },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', kind: 'llm', status: 'ok', modelId: 'Claude Haiku 5.5', runs: 21, finishPct: 86, meanScore: 712, decisionsPerRun: 9.4, latencyP50Ms: 410, latencyP95Ms: 2400, lateCrashes: 2, costPerRunUsd: 0.0031 },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', kind: 'llm', status: 'not_configured' },
  ],
};

describe('parseArena', () => {
  it('reads the results file', () => {
    const arena = parseArena(FILE)!;
    expect(arena.runs).toBe(126);
    expect(arena.contestants.map((entry) => entry.id)).toEqual(['jev', 'heuristic', 'claude-haiku-5-5', 'claude-opus-5-5']);
  });

  it('skips a malformed contestant and keeps the rest', () => {
    const arena = parseArena({ ...FILE, contestants: [...FILE.contestants, { id: 'x', label: 'X', kind: 'llm', status: 'ok', finishPct: 140 }, 'nonsense'] })!;
    expect(arena.contestants).toHaveLength(4);
  });

  it('is null when there is no usable file', () => {
    expect(parseArena(undefined)).toBeNull();
    expect(parseArena({ date: '2026-10-10' })).toBeNull();
    expect(parseArena({ ...FILE, runs: 'many' })).toBeNull();
  });
});

describe('arenaRows', () => {
  const rows = arenaRows(parseArena(FILE)!);

  it('formats every figure, and never shows a missing one as zero', () => {
    expect(rows[0]).toMatchObject({ label: 'Jev', finish: '91%', score: '780', decisions: '9.4', p50: '340 ms', p95: '1.28 s', lateCrashes: '1', cost: '—', configured: true });
    expect(rows[1]).toMatchObject({ p50: '0 ms', lateCrashes: '0', cost: '$0' });
    expect(rows[2]).toMatchObject({ p95: '2.40 s', cost: '$0.0031', detail: '21 runs' });
  });

  it('shows a brain with no key as not configured, with no figures', () => {
    expect(rows[3]).toMatchObject({ label: 'Claude Opus 5.5', configured: false, finish: '—', score: '—', p50: '—', cost: '—', detail: 'not configured' });
  });
});

describe('rows without a price or without runs', () => {
  it('shows reported tokens where no price is configured, as tokens', () => {
    const arena = parseArena({ ...FILE, contestants: [{ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', kind: 'llm', status: 'ok', modelId: 'claude-sonnet-5-5', runs: 24, inputTokens: 31381, outputTokens: 354 }] })!;
    expect(arenaRows(arena)[0]).toMatchObject({ cost: '31.7k tok', detail: 'claude-sonnet-5-5 · 24 runs', finish: '—' });
  });

  it('lists a brain that was set up but not run, with the reason and no figures', () => {
    const arena = parseArena({ ...FILE, notRun: [{ id: 'claude-opus-5-5-r', label: 'Claude Opus 5.5 (reasoning)', reason: 'held until the cost of the row is approved' }, { id: 'jev', label: 'Jev', reason: 'already a contestant' }] })!;
    const rows = arenaRows(arena);
    expect(rows).toHaveLength(5);
    expect(rows[4]).toMatchObject({ label: 'Claude Opus 5.5 (reasoning)', configured: false, detail: 'not run: held until the cost of the row is approved', score: '—', cost: '—' });
  });

  it('reads the results file that is in the repo', async () => {
    const { arenaResults } = await import('./arenaData');
    const real = arenaResults();
    // The file is the brain session's; when it is there it must parse and every row must have a name.
    if (real) expect(arenaRows(real).every((row) => row.label.length > 0)).toBe(true);
  });
});

describe('scatter', () => {
  it('places each brain that has both figures, latency across and score up', () => {
    const plot = scatter(parseArena(FILE)!, { width: 300, height: 200, padding: 20 })!;
    expect(plot.points.map((point) => point.id)).toEqual(['jev', 'heuristic', 'claude-haiku-5-5']);
    const [jev, heuristic, haiku] = plot.points;
    expect(heuristic!.x).toBe(20);
    expect(jev!.x).toBeLessThan(haiku!.x);
    expect(jev!.y).toBeLessThan(heuristic!.y);
    expect(plot.xMaxMs).toBeGreaterThanOrEqual(410);
    expect(plot.yMax).toBeGreaterThanOrEqual(780.4);
    for (const point of plot.points) {
      expect(point.x).toBeGreaterThanOrEqual(20);
      expect(point.x).toBeLessThanOrEqual(280);
      expect(point.y).toBeGreaterThanOrEqual(20);
      expect(point.y).toBeLessThanOrEqual(180);
    }
  });

  it('has nothing to plot with fewer than two brains measured', () => {
    expect(scatter(parseArena({ ...FILE, contestants: FILE.contestants.slice(3) })!, { width: 300, height: 200, padding: 20 })).toBeNull();
  });
});

describe('arenaLine', () => {
  it('says whose sim, how many runs and when, and what it is not', () => {
    expect(arenaLine(parseArena(FILE)!)).toBe('Our sim, our prompts, 126 runs, 2026-10-10. Not a general model ranking.');
  });
});
