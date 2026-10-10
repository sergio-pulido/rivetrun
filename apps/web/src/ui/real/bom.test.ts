import { describe, expect, it } from 'vitest';
import type { Build } from '@rivetrun/contracts';
import { PRESETS } from '@rivetrun/sim';
import rawBom from '../../../../../docs/inputs/bom-mk2.json';
import { canBuy, formatSubtotal, parsePrice, realForPart, realPlan, specRow, subtotal, type Bom, type BomItem } from './bom';

// The real file, shaped the way the loader shapes it (the loader itself needs Node's fs and is not under test here).
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

const keys = (lines: readonly { item: BomItem }[]): string[] => lines.map((line) => line.item.key);
const allRounder = PRESETS.all_rounder.build;

describe('parsePrice', () => {
  it('reads plain prices in either number style', () => {
    expect(parsePrice('US$29.95')).toEqual({ currency: 'US$', amount: 29.95 });
    expect(parsePrice('$12.95 USD')).toEqual({ currency: 'US$', amount: 12.95 });
    expect(parsePrice('€9,99')).toEqual({ currency: '€', amount: 9.99 });
    expect(parsePrice('€ 249')).toEqual({ currency: '€', amount: 249 });
    expect(parsePrice('€2.199,00 EUR')).toEqual({ currency: '€', amount: 2199 });
  });

  it('refuses anything that is not one plain amount', () => {
    for (const shown of ['From: $230.00', 'Available from $25', '€199.00 EUR / €319.00 EUR', '€1.814,00 (Basic Bundle)', 'Community price: $25.99', '', null]) {
      expect(parsePrice(shown), String(shown)).toBeNull();
    }
  });

  it('never fails on a price string that is in the file', () => {
    for (const item of Object.values(bom.items)) expect(() => parsePrice(item.priceShown)).not.toThrow();
  });
});

describe('realPlan', () => {
  it('maps the stock All-rounder: 2S, 12 V motors, 80 mm wheels with the printed tread', () => {
    const plan = realPlan(bom, allRounder);
    expect(keys(plan.core)).toEqual([...bom.select.core, 'motor_driver_max14870_rpi', 'power_switch_big_mp']);
    expect(keys(plan.chosen)).toEqual(['wheels_80x10', 'offroad_tread_tpu', 'motor_298to1_hpcb_12v_ext', 'battery_2s_large', 'camera_module_3', 'ultrasonic_hc_sr04', 'bumper_romi_switch_kit']);
    expect(plan.notes).toEqual([]);
  });

  it('switches driver, switch and motors at 1S, and says when no real pack exists', () => {
    const plan = realPlan(bom, { ...allRounder, batteryCells: 1 });
    expect(keys(plan.core)).toContain('motor_driver_drv8835_rpi_1s');
    expect(keys(plan.chosen)).toContain('motor_298to1_mp_6v_1s');
    expect(keys(plan.chosen)).not.toContain('battery_2s_large');
    expect(plan.notes).toEqual(['No real pack at this size (1S)']);
  });

  it('carries the file\'s 4S warning and the large-wheel note', () => {
    const plan = realPlan(bom, { ...allRounder, batteryCells: 4, wheelSizeMm: 90 });
    expect(plan.notes).toEqual([bom.select.wheelNote, bom.select.byCells['4']!.warning]);
    expect(keys(plan.chosen)).toContain('wheels_90x10');
    // A build saved when L was still 100 mm maps to the same wheel.
    expect(keys(realPlan(bom, { ...allRounder, wheelSizeMm: 100 }).chosen)).toContain('wheels_90x10');
  });

  it('gives tracks one line and no wheel', () => {
    const tracked: Build = { ...allRounder, locomotion: 'tracks', wheelSizeMm: 90 };
    expect(keys(realForPart(bom, tracked, 'tracks', 'locomotion').lines)).toEqual(['tracks_pololu_30t']);
    expect(realForPart(bom, tracked, 'tracks', 'locomotion').notes).toEqual([]);
  });

  it('finds the real component of a game part that is named after it', () => {
    expect(keys(realForPart(bom, allRounder, 'lidar_rplidar_c1', 'sensor').lines)).toEqual(['lidar_rplidar_c1']);
    expect(keys(realForPart(bom, allRounder, 'brushless_motor_dfrobot_fit0441', 'motor').lines)).toEqual(['brushless_motor_dfrobot_fit0441']);
    expect(realForPart(bom, allRounder, 'no_such_part', 'sensor').lines).toEqual([]);
  });

  it('only references keys that exist in the file', () => {
    for (const preset of Object.values(PRESETS)) {
      for (const cells of [1, 2, 3, 4]) {
        const plan = realPlan(bom, { ...preset.build, batteryCells: cells });
        for (const line of [...plan.core, ...plan.chosen]) expect(bom.items[line.item.key]).toBeDefined();
        expect(plan.core.length).toBe(bom.select.core.length + 2);
      }
    }
  });
});

describe('subtotal', () => {
  it('sums per currency, times quantity, and counts lines with no plain price', () => {
    const plan = realPlan(bom, allRounder);
    const sum = subtotal([...plan.core, ...plan.chosen]);
    const usd = sum.byCurrency.find((entry) => entry.currency === 'US$')!.amount;
    const eur = sum.byCurrency.find((entry) => entry.currency === '€')!.amount;
    // Core: driver 29.95 + regulator 17.95 + encoders 2 × 9.95 + switch 5.95 + screws 11.95; chosen: wheels 2 × 8.75 + motors 4 × 27.45 + ultrasonic 3.95 + bumpers 2 × 9.95.
    expect(usd).toBeCloseTo(29.95 + 17.95 + 19.9 + 5.95 + 11.95 + 17.5 + 109.8 + 3.95 + 19.9, 2);
    // XT60 5.99 + inserts 8.99 + 2S large pack 14.99.
    expect(eur).toBeCloseTo(5.99 + 8.99 + 14.99, 2);
    // Pi 5, two fuse lines, filament, printed tread (no price) and the camera ("Available from $25").
    expect(sum.atRetailer).toBe(6);
    expect(formatSubtotal(sum)).toMatch(/^US\$ \d+\.\d{2} \+ € \d+\.\d{2}$/);
  });

  it('has no figure when nothing has a plain price', () => {
    expect(formatSubtotal(subtotal([]))).toBeNull();
  });
});

describe('links and specs', () => {
  it('offers no link for an unverified item or one with no page', () => {
    expect(canBuy(bom.items.battery_1s_large!)).toBe(false);
    expect(canBuy(bom.items.piston_jump_spring!)).toBe(false);
    expect(canBuy(bom.items.ultrasonic_hc_sr04!)).toBe(true);
  });

  it('turns unit suffixes in spec keys into units', () => {
    expect(specRow('massG', 8.7)).toEqual({ label: 'Mass', value: '8.7 g' });
    expect(specRow('dimensionsMm', '45.5 x 20 x 15.5')).toEqual({ label: 'Dimensions', value: '45.5 x 20 x 15.5 mm' });
    expect(specRow('buildVolumeMm', [180, 180, 180])).toEqual({ label: 'Build volume', value: '180 × 180 × 180 mm' });
    expect(specRow('nominalV', 7.4)).toEqual({ label: 'Nominal', value: '7.4 V' });
    expect(specRow('interface', 'Trig/Echo pins')).toEqual({ label: 'Interface', value: 'Trig/Echo pins' });
  });
});
