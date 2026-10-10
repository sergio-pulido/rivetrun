import { describe, expect, it } from 'vitest';
import { approximateKeys } from './models';

describe('approximateKeys', () => {
  it('lists the keys whose render the manifest marks approximate', () => {
    const manifest = [
      { key: 'lidar_rplidar_c1', render: 'x.png', approximate: true },
      { key: 'imu_mpu6050', render: 'y.png', approximate: false },
      { key: 'camera_module_3', render: 'z.png', approximations: ['Lens barrel diameter approximated.'] },
    ];
    expect(approximateKeys(manifest)).toEqual(['lidar_rplidar_c1']);
  });

  it('takes only a literal true, and skips entries it cannot read', () => {
    expect(approximateKeys([{ key: 'a', approximate: 'true' }, { key: 'b', approximate: 1 }, { approximate: true }, null, 'x', { key: 'c', approximate: true }])).toEqual(['c']);
  });

  it('is empty for a manifest that is missing or not a list', () => {
    expect(approximateKeys(undefined)).toEqual([]);
    expect(approximateKeys({ key: 'a', approximate: true })).toEqual([]);
  });
});
