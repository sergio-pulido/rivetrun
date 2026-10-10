import type { BrainQuestion } from '@rivetrun/contracts';
import { heuristicBrain, MISSIONS, PRESETS, runHeadless } from '@rivetrun/sim';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClientBrain, DECIDE_TIMEOUT_MS } from './clientBrain';

let question: BrainQuestion;
beforeAll(async () => {
  await runHeadless(MISSIONS.M1, 1001, PRESETS.all_rounder.build, { decide: (asked) => ((question ??= asked), heuristicBrain.decide(asked)) }, { priority: 0.5 });
});

/** A server that never answers: the request ends only when the client gives up. */
const silentServer = () =>
  vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));

describe('client brain when Jev is slow', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const decide = async (brain: ReturnType<typeof createClientBrain>) => {
    const pending = brain.decide(question);
    await vi.advanceTimersByTimeAsync(DECIDE_TIMEOUT_MS + 10);
    return pending;
  };

  it('falls back after the timeout, then stops asking for a while after two late answers in a row', async () => {
    const fetchMock = silentServer();
    vi.stubGlobal('fetch', fetchMock);
    const reasons: string[] = [];
    const brain = createClientBrain({ onFallback: (reason) => reasons.push(reason) });

    for (let i = 0; i < 2; i++) expect(await decide(brain)).toMatchObject({ policy: 'heuristic', fallback: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Paused: the fixed rules answer at once, with no request and no 1.2 s wait.
    const quick = await brain.decide(question);
    expect(quick).toMatchObject({ policy: 'heuristic', fallback: true });
    expect(quick.latencyMs).toBeLessThan(50);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reasons.at(-1)).toContain('too slowly');

    // After the pause Jev is asked again.
    await vi.advanceTimersByTimeAsync(8000);
    await decide(brain);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('a fast error is not "slow": Jev is asked again on the next decision', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    const brain = createClientBrain();
    for (let i = 0; i < 4; i++) expect(await brain.decide(question)).toMatchObject({ fallback: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
