import { beforeEach, describe, expect, it } from 'vitest';
import { parseOwned, printedKey, useInventoryStore } from './inventory';

const store = () => useInventoryStore.getState();

beforeEach(() => useInventoryStore.setState({ owned: [] }));

describe('inventory', () => {
  it('marks a part as owned and unmarks it again', () => {
    store().toggle('raspberry_pi_5_4gb');
    store().toggle('imu_mpu6050');
    expect(store().owned).toEqual(['raspberry_pi_5_4gb', 'imu_mpu6050']);
    store().toggle('raspberry_pi_5_4gb');
    expect(store().owned).toEqual(['imu_mpu6050']);
  });

  it('keeps printed parts apart from bought ones with the same name', () => {
    expect(printedKey('battery_tray')).toBe('printed:battery_tray');
    store().toggle(printedKey('battery_tray'));
    expect(store().owned).toEqual(['printed:battery_tray']);
  });

  it('reads back only what it wrote: a list of names, once each', () => {
    expect(parseOwned(['a', 'b', 'a'])).toEqual(['a', 'b']);
    expect(parseOwned(['a', 3, null, ''])).toEqual(['a']);
    expect(parseOwned({ owned: ['a'] })).toEqual([]);
    expect(parseOwned(null)).toEqual([]);
  });
});
