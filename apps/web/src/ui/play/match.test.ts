import { describe, expect, it } from 'vitest';
import { after, planTitle, readMatch, ringLeft, secondsLeft } from './match';

describe('readMatch', () => {
  it('reads a room, its seat and the server clock', () => {
    expect(readMatch(200, { code: 'KQ7M', endsAt: 31_000, playerId: 'p1', token: 't1', serverNow: 1_500 }, 1_000)).toEqual({ kind: 'room', code: 'KQ7M', endsAt: 31_000, seat: { playerId: 'p1', token: 't1' }, clockOffsetMs: 500 });
    expect(readMatch(200, { code: 'KQ7M', endsAt: 31_000 }, 1_000)).toEqual({ kind: 'room', code: 'KQ7M', endsAt: 31_000, seat: null, clockOffsetMs: 0 });
  });

  it('reads "next race in N s" when every room is busy', () => {
    expect(readMatch(429, { retryInS: 12.2 }, 0)).toEqual({ kind: 'wait', seconds: 13 });
    expect(readMatch(200, { nextRaceInS: 4 }, 0)).toEqual({ kind: 'wait', seconds: 4 });
    expect(readMatch(503, { error: 'busy' }, 0)).toEqual({ kind: 'wait', seconds: 5 });
    expect(readMatch(429, { retryInS: 9999 }, 0)).toEqual({ kind: 'wait', seconds: 120 });
  });

  it('makes no room up from anything else', () => {
    expect(readMatch(404, null, 0)).toEqual({ kind: 'unavailable' });
    expect(readMatch(200, { code: '', endsAt: 5 }, 0)).toEqual({ kind: 'unavailable' });
    expect(readMatch(500, { code: 'KQ7M', endsAt: 5 }, 0)).toEqual({ kind: 'unavailable' });
    expect(readMatch(200, '<html>', 0)).toEqual({ kind: 'unavailable' });
  });
});

describe('the countdown', () => {
  it('counts whole seconds down to 0 and stays there', () => {
    expect(secondsLeft(30_000, 0)).toBe(30);
    expect(secondsLeft(30_000, 29_100)).toBe(1);
    expect(secondsLeft(30_000, 30_000)).toBe(0);
    expect(secondsLeft(30_000, 45_000)).toBe(0);
  });

  it('empties the ring over the lobby', () => {
    expect(ringLeft(30_000, 0)).toBe(1);
    expect(ringLeft(30_000, 15_000)).toBe(0.5);
    expect(ringLeft(30_000, 99_000)).toBe(0);
    expect(ringLeft(90_000, 0)).toBe(1);
  });
});

describe('the three taps', () => {
  it('each tap moves to the next step, then waits for the start', () => {
    expect(after('vehicle')).toBe('agent');
    expect(after('agent')).toBe('strategy');
    expect(after('strategy')).toBe('waiting');
    expect(after('waiting')).toBe('waiting');
  });

  it('names the model that really planned', () => {
    expect(planTitle('claude-sonnet-5-5')).toBe("Claude's plan");
    expect(planTitle('gpt-6.1-sol')).toBe("gpt-6.1-sol's plan");
    expect(planTitle(null)).toBe("Claude's plan");
  });
});
