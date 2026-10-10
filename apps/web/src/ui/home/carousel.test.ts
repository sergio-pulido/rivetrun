import { describe, expect, it } from 'vitest';
import { pageCount, pageOf, playFirst, step, swipe } from './carousel';

describe('vehicle carousel', () => {
  it('wraps round in both directions', () => {
    expect(step(0, 1, 4)).toBe(1);
    expect(step(3, 1, 4)).toBe(0);
    expect(step(0, -1, 4)).toBe(3);
    expect(step(2, 0, 4)).toBe(2);
    expect(step(0, 1, 0)).toBe(0);
  });

  it('reads a horizontal drag as a swipe only past 40 px', () => {
    expect(swipe(200, 150)).toBe(1);
    expect(swipe(150, 200)).toBe(-1);
    expect(swipe(200, 180)).toBe(0);
    expect(swipe(200, 239)).toBe(0);
  });
});

describe('missions grid', () => {
  it('puts the Play mission first and keeps the rest in order', () => {
    expect(playFirst(['M1', 'M2', 'M7', 'M8'], 'M7')).toEqual(['M7', 'M1', 'M2', 'M8']);
    expect(playFirst(['M1', 'M2'], 'M1')).toEqual(['M1', 'M2']);
    expect(playFirst(['M1', 'M2'], 'M9')).toEqual(['M1', 'M2']);
  });

  it('pages nine missions six at a time', () => {
    expect(pageCount(9, 6)).toBe(2);
    expect(pageCount(6, 6)).toBe(1);
    expect(pageCount(0, 6)).toBe(1);
    expect(pageOf(5, 6)).toBe(0);
    expect(pageOf(6, 6)).toBe(1);
  });
});
