import { describe, expect, it } from 'vitest';
import { rankRacers } from './standings';
import { arrivedLate, thinkingCost } from './thinkingCost';

const log = (lostM: number, label: string) => ({ lostM, trigger: { kind: 'perception', cause: 'hazard_seen', label } as never });

describe('thinking cost', () => {
  it('sums the metres driven while waiting and counts the decisions', () => {
    const cost = thinkingCost([log(0.5, 'LIDAR · rock 11.8 m'), log(1.2, 'ENERGY · finish at 6 %'), log(0, 'START · run begins')]);
    expect(cost.metres).toBeCloseTo(1.7);
    expect(cost.decisions).toBe(3);
    expect(cost.late).toBe(0);
  });

  it('counts a decision as late only when the trigger named a distance the robot had already covered', () => {
    expect(arrivedLate(log(3.2, 'PLAN · scan zone "survivor" in 3 m'))).toBe(true);
    expect(arrivedLate(log(2.9, 'PLAN · scan zone "survivor" in 3 m'))).toBe(false);
    expect(arrivedLate(log(9, 'ENERGY · finish at 6 %'))).toBe(false);
    expect(thinkingCost([log(3.2, 'SONAR · rock 3 m'), log(0.1, 'SONAR · rock 3 m')]).late).toBe(1);
  });
});

describe('standings', () => {
  const racer = (id: string, xM: number, more: object = {}) => ({ id, name: id, xM, damagePct: 0, ...more });

  it('ranks by distance while everyone is running, with the gap to the leader', () => {
    const rows = rankRacers([racer('you', 10), racer('jev', 14.2), racer('rules', 7)]);
    expect(rows.map((row) => [row.id, row.rank, row.gap])).toEqual([['jev', 1, 'LEAD'], ['you', 2, '−4.2 m'], ['rules', 3, '−7.2 m']]);
  });

  it('puts finishers first by time and those that are out last', () => {
    const rows = rankRacers([racer('a', 30), racer('b', 62, { finishedS: 33.4 }), racer('c', 62, { finishedS: 31 }), racer('d', 45, { out: 'WRECKED' })]);
    expect(rows.map((row) => [row.id, row.gap])).toEqual([['c', '31.0 s'], ['b', '+2.4 s'], ['a', '30 m'], ['d', 'WRECKED']]);
  });
});
