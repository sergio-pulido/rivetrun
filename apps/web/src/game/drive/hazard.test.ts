import { describe, expect, it } from 'vitest';
import type { Observation } from '@rivetrun/contracts';
import { brakeBand, hazardWarning, throttleBand } from './hazard';

const seeing = (patch: Partial<Observation>): Observation => ({ hazard: null, gap: null, ...patch }) as Observation;

describe('hazardWarning', () => {
  it('says nothing without an Observation or with nothing in range', () => {
    expect(hazardWarning(null, 2, 0.9)).toBeNull();
    expect(hazardWarning(seeing({}), 2, 0.9)).toBeNull();
  });

  it('a blind build is not warned: its hazard reading is unknown', () => {
    expect(hazardWarning(seeing({ hazard: 'unknown', gap: 'unknown' }), 2, 0.9)).toBeNull();
  });

  it('warns about 3 s ahead, not earlier', () => {
    const far = seeing({ hazard: { source: 'lidar', distanceM: 10, kind: 'rock' } });
    expect(hazardWarning(far, 2, 0.9)).toBeNull();
    expect(hazardWarning(far, 4, 0.9)?.what).toBe('rock');
  });

  it('uses the sensor safe speed when the kind is known, the build one otherwise, and flags going over it', () => {
    const named = hazardWarning(seeing({ hazard: { source: 'camera', distanceM: 3, kind: 'log', safeSpeedMps: 1.2 } }), 2, 0.9);
    expect(named).toMatchObject({ what: 'log', safeMps: 1.2, over: true });
    const blip = hazardWarning(seeing({ hazard: { source: 'ultrasonic', distanceM: 2 } }), 0.8, 0.9);
    expect(blip).toMatchObject({ what: 'obstacle', safeMps: 0.9, over: false });
  });

  it('reports the nearer of a gap and an obstacle', () => {
    const both = seeing({ hazard: { source: 'lidar', distanceM: 5 }, gap: { source: 'lidar', distanceM: 2, widthM: 0.6 } });
    expect(hazardWarning(both, 3, 0.9)).toMatchObject({ what: 'gap', widthM: 0.6 });
  });
});

describe('pedal bands follow the sim thresholds', () => {
  it('throttle', () => {
    expect([0, 0.14, 0.15, 0.49, 0.5, 0.84, 0.85, 1].map(throttleBand)).toEqual(['COAST', 'COAST', 'EASE', 'EASE', 'STEADY', 'STEADY', 'FULL', 'FULL']);
  });
  it('brake', () => {
    expect([0, 0.09, 0.1, 0.59, 0.6, 1].map(brakeBand)).toEqual(['OFF', 'OFF', 'SOFT', 'SOFT', 'HARD', 'HARD']);
  });
});
