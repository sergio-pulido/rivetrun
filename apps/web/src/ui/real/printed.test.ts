import { describe, expect, it } from 'vitest';
import { formatGrams, formatHours, isEstimate, printTotals } from './printed';
import type { PrintedPart } from './printedData';

const part = (patch: Partial<PrintedPart>): PrintedPart => ({
  id: 'p', name: 'Part', qty: 1, material: 'PETG', layerMm: 0.2, infillPct: 15, supports: false, grams: 10, hours: 1, source: 'slicer', ...patch,
});

describe('printed parts', () => {
  it('formats time and weight', () => {
    expect(formatHours(1.536111)).toBe('1 h 32 min');
    expect(formatHours(0.106389)).toBe('6 min');
    expect(formatHours(2)).toBe('2 h');
    expect(formatGrams(40.28)).toBe('40 g');
    expect(formatGrams(0.37)).toBe('0.4 g');
  });

  it('totals each part times its quantity', () => {
    const totals = printTotals([part({ grams: 40.28, hours: 1.5 }), part({ id: 'q', qty: 4, grams: 5.31, hours: 0.25 })]);
    expect(totals.pieces).toBe(5);
    expect(totals.grams).toBeCloseTo(40.28 + 4 * 5.31, 2);
    expect(totals.hours).toBeCloseTo(2.5, 5);
    expect(totals.estimated).toBe(false);
  });

  it('gives no total when a part has no figure, and marks non-slicer figures as estimates', () => {
    const totals = printTotals([part({}), part({ id: 'q', grams: null, source: 'guess' })]);
    expect(totals.grams).toBeNull();
    expect(totals.hours).toBe(2);
    expect(totals.estimated).toBe(true);
    expect(isEstimate(part({ source: null }))).toBe(true);
  });
});
