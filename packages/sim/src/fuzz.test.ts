import { describe, expect, it } from 'vitest';
import type { Action, Build, SimState } from '@rivetrun/contracts';
import { BuildSchema, OutcomeSchema, SimStateSchema } from '@rivetrun/contracts';
import { MISSIONS, MISSION_IDS, PARTS, TUNING, availableActions, createRun, replayDrive, score, step } from './index';
import type { DriveLogEntry } from './index';
import { mulberry32 } from './rng';

const RUNS = 500;
/** No run may take more steps than the clock allows, plus room for the penalties that jump it. */
const MAX_STEPS = (TUNING.maxRunS * 1000) / TUNING.dtMs + 400;
const ids = (slot: string): string[] => PARTS.filter((part) => part.slot === slot && !part.comingSoon).map((part) => part.id);
const SLOTS = { locomotion: ids('locomotion'), motor: ids('motor'), battery: ids('battery'), sensor: ids('sensor'), extra: ids('extra') };

function randomBuild(random: () => number): Build {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const some = (list: readonly string[]): string[] => [...new Set(Array.from({ length: Math.floor(random() * 3) }, () => pick(list)))];
  return {
    locomotion: pick(SLOTS.locomotion), motor: pick(SLOTS.motor), battery: pick(SLOTS.battery),
    sensors: some(SLOTS.sensor), extras: some(SLOTS.extra),
    batteryCells: pick([1, 2, 3, 4]), wheelSizeMm: pick([60, 80, 90] as const), gearStep: pick([1, 2, 3, 4, 5]),
  };
}

/** A player mashing the controls: analog pedals, the action button, the held jump, all changing at random moments. */
function randomInputLog(random: () => number): DriveLogEntry[] {
  const log: DriveLogEntry[] = [];
  for (let t = 0; t < TUNING.maxRunS; t += 0.05 + random() * 1.2) {
    const mood = random();
    log.push({
      t: Math.round(t * 20) / 20,
      throttle: mood < 0.15 ? 0 : Math.round(random() * 100) / 100,
      brake: random() < 0.2 ? Math.round(random() * 100) / 100 : 0,
      ...(random() < 0.12 ? { special: (['jump', 'winch', 'climb'] as const)[Math.floor(random() * 3)]! } : {}),
      ...(random() < 0.1 ? { jumpHeld: true } : {}),
      action: 'coast',
    });
  }
  return log;
}

function checkFrame(frame: SimState, lengthM: number, label: string): void {
  const numbers = [frame.t, frame.x, frame.v, frame.battery, frame.damage, frame.pitch, frame.slopeDeg, frame.wheelSpin, frame.heightM ?? 0, frame.vy ?? 0, frame.windMps ?? 0];
  if (!numbers.every(Number.isFinite)) throw new Error(`${label}: a NaN or infinity in ${JSON.stringify(frame)}`);
  if (frame.battery < 0 || frame.battery > 100) throw new Error(`${label}: battery ${frame.battery}`);
  if (frame.damage < 0 || frame.damage > 100) throw new Error(`${label}: damage ${frame.damage}`);
  if (frame.x > lengthM + 1e-6) throw new Error(`${label}: x ${frame.x} beyond the ${lengthM} m track`);
  if ((frame.heightM ?? 0) < 0) throw new Error(`${label}: height ${frame.heightM}`);
}

describe('fuzz: random builds and random inputs never break the sim', () => {
  it(`${RUNS} runs across M1–M9: no NaN, battery and damage within 0–100, never past the finish, every run ends, no exception`, () => {
    const random = mulberry32(20261010);
    let finished = 0;
    for (let run = 0; run < RUNS; run += 1) {
      const mission = MISSIONS[MISSION_IDS[run % MISSION_IDS.length]!];
      const build = randomBuild(random);
      expect(BuildSchema.safeParse(build).success).toBe(true);
      const seed = Math.floor(random() * 0xffffffff);
      const lengthM = mission.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
      const label = `run ${run} ${mission.id} seed ${seed} ${JSON.stringify(build)}`;

      if (run % 2 === 0) {
        // A player: the logged-input path, with held jumps and pedals in the air.
        const { episode, ghost } = replayDrive({ mission, seed, build, priority: random() }, randomInputLog(random));
        for (const frame of ghost.frames) checkFrame(frame, lengthM, label);
        expect(ghost.frames.length, label).toBeLessThan(MAX_STEPS);
        expect(OutcomeSchema.safeParse(episode.outcome).success, label).toBe(true);
        if (episode.outcome.finished) finished += 1;
      } else {
        // A brain gone wild: any available action, reverse included, changed at random.
        const actions = availableActions(build);
        let state = createRun({ mission, seed, build, priority: random() });
        let action: Action = 'cruise';
        let steps = 0;
        while (!state.done) {
          if (random() < 0.08) action = actions[Math.floor(random() * actions.length)]!;
          state = step(state, action);
          checkFrame(state.sim, lengthM, label);
          steps += 1;
          if (steps > MAX_STEPS) throw new Error(`${label}: the run did not end`);
        }
        expect(SimStateSchema.safeParse(state.sim).success, label).toBe(true);
        const outcome = score(state);
        expect(OutcomeSchema.safeParse(outcome).success, label).toBe(true);
        if (outcome.finished) finished += 1;
      }
    }
    // Sanity: the fuzz is not just 500 robots standing still.
    expect(finished).toBeGreaterThan(20);
  }, 10000);
});
