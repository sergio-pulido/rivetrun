import { describe, expect, it } from 'vitest';
import { pairWithGhost, parseReactions, reactionDuel, type ReactionEvent } from './reactions';

const event = (label: string, humanS: number | null, jevMs: number | null, xM = 10): ReactionEvent => ({ t: xM / 2, xM, label, humanS, jevMs });

describe('parseReactions', () => {
  it('reads the events the sim puts on the outcome breakdown', () => {
    const fromSim = [{ t: 4.2, xM: 11.5, label: 'CAMERA · rock 5.9 m', cause: 'hazard_seen', humanS: 0.82 }];
    expect(parseReactions(fromSim)).toEqual([{ t: 4.2, xM: 11.5, label: 'CAMERA · rock 5.9 m', humanS: 0.82 }]);
  });

  it('is null for a run with no reaction data or data in another shape', () => {
    expect(parseReactions(undefined)).toBeNull();
    expect(parseReactions([{ label: 'rock' }])).toBeNull();
    expect(parseReactions([{ t: 1, xM: 1, label: 'rock', humanS: -1 }])).toBeNull();
  });
});

describe('reactionDuel', () => {
  it('compares the median reaction of each side and lists every event', () => {
    const duel = reactionDuel([event('LIDAR · rock 11 m', 0.9, 300, 22), event('CAMERA · mud 6 m', 0.82, 340, 31), event('IMU · slip', 0.5, 420, 40)])!;
    expect(duel.headline).toBe('Your reaction 0.82 s · Jev 0.34 s');
    expect(duel.note).toBe('Median of 3 events');
    expect(duel.rows.map((row) => [row.label, row.atM, row.you, row.jev, row.faster])).toEqual([
      ['LIDAR · rock 11 m', 22, '0.90 s', '0.30 s', 'jev'],
      ['CAMERA · mud 6 m', 31, '0.82 s', '0.34 s', 'jev'],
      ['IMU · slip', 40, '0.50 s', '0.42 s', 'jev'],
    ]);
  });

  it('says "no reaction" where the player did not react, and leaves those out of the median', () => {
    const duel = reactionDuel([event('rock', null, 300), event('mud', 0.4, 600), event('gap', null, null)])!;
    expect(duel.headline).toBe('Your reaction 0.40 s · Jev 0.45 s');
    expect(duel.note).toBe('Median of 3 events · you did not react to 2');
    expect(duel.rows.map((row) => [row.you, row.jev, row.faster])).toEqual([
      ['no reaction', '0.30 s', 'jev'],
      ['0.40 s', '0.60 s', 'you'],
      ['no reaction', '—', null],
    ]);
  });

  it('does not invent a time for a side that never reacted', () => {
    expect(reactionDuel([event('rock', null, 250)])!.headline).toBe('Your reaction: none · Jev 0.25 s');
    expect(reactionDuel([event('rock', 0.7, null)])!.headline).toBe('Your reaction 0.70 s · Jev —');
  });

  it('falls back to the median latency of the ghost where an event has no time of its own, marked and with no winner', () => {
    const events = [{ t: 2, xM: 5, label: 'CAMERA · rock 5.9 m', humanS: 0.9 }, { t: 6, xM: 17, label: 'IMU · slip', humanS: null }];
    const duel = reactionDuel(events, 340)!;
    expect(duel.headline).toBe('Your reaction 0.90 s · Jev 0.34 s');
    expect(duel.jevPerEvent).toBe(true);
    expect(duel.rows.map((row) => [row.you, row.jev, row.jevIsMedian, row.faster])).toEqual([['0.90 s', '0.34 s', true, null], ['no reaction', '0.34 s', true, null]]);
    const bare = reactionDuel(events)!;
    expect(bare.headline).toBe('Your reaction 0.90 s · Jev —');
    expect(bare.jevPerEvent).toBe(false);
  });

  it('has nothing to show for a run with no events', () => {
    expect(reactionDuel([])).toBeNull();
  });
});

describe('pairWithGhost', () => {
  const events: ReactionEvent[] = [
    { id: 'hazard_seen:2:lidar', t: 4, xM: 11, label: 'LIDAR · rock 11 m', humanS: 0.8 },
    { id: 'terrain_seen:3:camera', t: 9, xM: 20, label: 'CAMERA · mud 6 m', humanS: 0.5 },
    { id: 'gap_seen:1:lidar', t: 12, xM: 30, label: 'LIDAR · gap 9 m', humanS: null },
    { t: 15, xM: 40, label: 'IMU · slip', humanS: 0.3 },
  ];
  const log = [
    { trigger: { eventId: 'hazard_seen:2:lidar' }, latencyMs: 236, fallback: false },
    { trigger: { eventId: 'hazard_seen:2:lidar' }, latencyMs: 900, fallback: false },
    { trigger: { eventId: 'terrain_seen:3:camera' }, latencyMs: 0, fallback: true },
    { trigger: {}, latencyMs: 410, fallback: false },
  ];

  it('gives each event the latency of the first decision Jev itself made on the event with the same id', () => {
    expect(pairWithGhost(events, log).map((event) => event.jevMs)).toEqual([236, undefined, undefined, undefined]);
  });

  it('shows the own latency where paired and the run median elsewhere', () => {
    const duel = reactionDuel(pairWithGhost(events, log), 300)!;
    expect(duel.rows.map((row) => [row.jev, row.jevIsMedian, row.faster])).toEqual([
      ['0.24 s', false, 'jev'],
      ['0.30 s', true, null],
      ['0.30 s', true, null],
      ['0.30 s', true, null],
    ]);
    expect(duel.headline).toBe('Your reaction 0.50 s · Jev 0.24 s');
  });

  it('leaves the events as they are when the ghost has no log', () => {
    expect(pairWithGhost(events, [])).toEqual(events);
  });
});
