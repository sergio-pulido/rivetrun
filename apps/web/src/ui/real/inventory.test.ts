import { describe, expect, it } from 'vitest';
import { PRESETS } from '@rivetrun/sim';
import rawBom from '../../../../../docs/inputs/bom-mk2.json';
import { formatSubtotal, parsePrice, realPlan, type Bom, type BomItem } from './bom';
import { stock } from './inventory';

const bom: Bom = {
  checkedAt: rawBom.checkedAt,
  select: rawBom.select as Bom['select'],
  items: Object.fromEntries(
    (rawBom.items as Record<string, unknown>[]).map((item) => [
      item.key as string,
      { qty: null, unit: null, url: null, priceShown: null, manufacturer: null, model: null, gameId: null, scenario: null, usedFor: null, notes: '', specs: {}, ...item } as unknown as BomItem,
    ]),
  ),
};
const plan = realPlan(bom, PRESETS.all_rounder.build);
const lines = [...plan.core, ...plan.chosen];
const printed = [{ id: 'chassis_base' }, { id: 'battery_tray' }];
const everything = [...lines.map((line) => line.item.key), 'printed:chassis_base', 'printed:battery_tray'];

describe('stock', () => {
  it('starts with everything still to get', () => {
    const state = stock(lines, printed, []);
    expect(state).toMatchObject({ total: lines.length + 2, have: 0, ready: false, toPrint: 2 });
    expect(state.toBuy).toHaveLength(lines.length);
  });

  it('takes owned lines out of what is left to buy, and out of its cost', () => {
    // A line with a plain price, so owning it has to move the figure.
    const first = lines.find((line) => parsePrice(line.item.priceShown))!.item.key;
    const state = stock(lines, printed, [first, 'printed:battery_tray', 'something_else']);
    expect(state.have).toBe(2);
    expect(state.toBuy.map((line) => line.item.key)).not.toContain(first);
    expect(state.toBuy).toHaveLength(lines.length - 1);
    expect(state.toPrint).toBe(1);
    expect(formatSubtotal(state.toBuySum)).not.toBe(formatSubtotal(stock(lines, printed, []).toBuySum));
  });

  it('is ready only when every line and every printed part is in hand', () => {
    expect(stock(lines, printed, everything.slice(1)).ready).toBe(false);
    expect(stock(lines, printed, everything.filter((key) => key !== 'printed:chassis_base')).ready).toBe(false);
    const done = stock(lines, printed, everything);
    expect(done).toMatchObject({ ready: true, have: done.total, toPrint: 0 });
    expect(done.toBuy).toEqual([]);
  });

  it('is never ready with nothing to build', () => {
    expect(stock([], [], []).ready).toBe(false);
  });
});
