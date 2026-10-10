import { describe, expect, it } from 'vitest';
import { nextPollMs, parseRivalStatus, rivalStatusLine } from './rivalStatus';

describe('parseRivalStatus', () => {
  it('reads the three states the server answers with', () => {
    expect(parseRivalStatus({ status: 'ready', decisions: 12, fallbacks: 0 })).toBe('ready');
    expect(parseRivalStatus({ status: 'computing' })).toBe('computing');
    expect(parseRivalStatus({ status: 'unavailable' })).toBe('unavailable');
  });

  it('does not guess from anything else', () => {
    expect(parseRivalStatus({ status: 'done' })).toBe('unknown');
    expect(parseRivalStatus(null)).toBe('unknown');
    expect(parseRivalStatus({ ghost: {} })).toBe('unknown');
  });
});

describe('nextPollMs', () => {
  it('asks again every second while Jev is computing, slowly when it could not drive, and stops when it is ready', () => {
    expect(nextPollMs('computing')).toBe(1000);
    expect(nextPollMs('unavailable')).toBeGreaterThanOrEqual(15000);
    expect(nextPollMs('unknown')).toBeGreaterThanOrEqual(5000);
    expect(nextPollMs('ready')).toBeNull();
    // A server that stays "computing" far longer than a ghost takes is not hammered once a second for ever.
    expect(nextPollMs('computing', 44)).toBe(1000);
    expect(nextPollMs('computing', 45)).toBe(5000);
  });
});

describe('rivalStatusLine', () => {
  it('says whether the ghost will be Jev', () => {
    expect(rivalStatusLine('ready')).toEqual({ tone: 'ok', text: 'Jev is ready to race you.' });
    expect(rivalStatusLine('computing')).toEqual({ tone: 'wait', text: 'Jev is getting ready… Start now and you race the built-in driver instead.' });
    expect(rivalStatusLine('unavailable')).toEqual({ tone: 'warn', text: 'Jev could not drive this one: you will race the built-in driver.' });
  });

  it('says nothing when it does not know', () => {
    expect(rivalStatusLine('unknown')).toBeNull();
    expect(rivalStatusLine('idle')).toBeNull();
  });
});
