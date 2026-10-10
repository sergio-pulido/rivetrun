import { describe, expect, it } from 'vitest';
import { MISSIONS, PRESETS, replayDrive } from './index';
import type { DriveLogEntry } from './index';

const config = { mission: MISSIONS.M1, seed: 5, build: PRESETS.all_rounder.build, priority: 0.5 };
const entry = (t: number, throttle: number, brake: number): DriveLogEntry => ({ t, throttle, brake, action: 'coast' });
/** x of the ghost frame nearest to sim time t. */
const xAt = (frames: readonly { t: number; x: number }[], t: number): number => frames.reduce((best, f) => (Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best)).x;

describe('reverse for the human driver', () => {
  it('stopped with the brake held: nothing for 0.4 s, then it backs up, slower with less brake, and stops when the brake is let go', () => {
    // Drive 4 s, brake hard to a stop, keep holding to 12 s, let go.
    const run = (brake: number) => replayDrive(config, [entry(0, 1, 0), entry(4, 0, brake), entry(12, 0, 0), entry(16, 1, 0)]).ghost.frames;
    const full = run(1);
    const stoppedAt = Math.max(...full.filter((f) => f.t <= 12).map((f) => f.x));
    expect(stoppedAt).toBeGreaterThan(3);
    expect(xAt(full, 12)).toBeLessThan(stoppedAt - 1);
    expect(Math.min(...full.filter((f) => f.t > 5 && f.t < 12).map((f) => f.v))).toBeLessThan(-0.3);
    // Let go: it rolls to rest and does not keep backing up.
    expect(Math.abs(xAt(full, 15.9) - xAt(full, 14))).toBeLessThan(0.05);
    const part = run(0.6);
    expect(xAt(part, 12)).toBeLessThan(Math.max(...part.filter((f) => f.t <= 12).map((f) => f.x)) - 0.3);
    expect(Math.min(...part.map((f) => f.v))).toBeGreaterThan(Math.min(...full.map((f) => f.v)));
  });

  it('a moving robot still brakes: no reverse while it is rolling, and a soft brake never reverses', () => {
    const hard = replayDrive(config, [entry(0, 1, 0), entry(4, 0, 1), entry(4.6, 1, 0)]).ghost.frames;
    expect(Math.min(...hard.filter((f) => f.t <= 4.6).map((f) => f.v))).toBeGreaterThanOrEqual(0);
    const soft = replayDrive(config, [entry(0, 1, 0), entry(4, 0, 0.5), entry(14, 1, 0)]).ghost.frames;
    expect(Math.min(...soft.filter((f) => f.t <= 14).map((f) => f.v))).toBeGreaterThanOrEqual(-0.01);
  });

  it('stops at the start line', () => {
    const frames = replayDrive(config, [entry(0, 0.6, 0), entry(1, 0, 1), entry(20, 1, 0)]).ghost.frames;
    expect(Math.min(...frames.map((f) => f.x))).toBe(0);
    expect(frames.some((f) => f.v < -0.1)).toBe(true);
  });

  it('replays are deterministic', () => {
    const log = [entry(0, 1, 0), entry(4, 0, 0.8), entry(9, 0.7, 0), entry(12, 0, 1), entry(15, 1, 0)];
    const a = replayDrive(config, log);
    const b = replayDrive(config, log);
    expect(a.episode.outcome).toEqual(b.episode.outcome);
    expect(a.ghost.frames).toEqual(b.ghost.frames);
  });
});
