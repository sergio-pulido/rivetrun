import { EpisodeSchema, GhostTraceSchema, type RunEvent } from '@rivetrun/contracts';
declare const performance: { now(): number };
declare const console: { log(text: string): void };
import { describe, expect, it } from 'vitest';
import { MISSIONS, MISSION_IDS, PRESETS, heuristicBrain, randomBrain, runController, runHeadless } from './index';

describe('sim smoke', () => {
  it('every preset finishes M1 with the heuristic brain, deterministically', async () => {
    for (const preset of Object.values(PRESETS)) {
      const a = await runHeadless(MISSIONS.M1, 7, preset.build, heuristicBrain);
      const b = await runHeadless(MISSIONS.M1, 7, preset.build, heuristicBrain);
      expect(a.episode.outcome.finished, preset.id).toBe(true);
      expect(a.ghost).toEqual(b.ghost);
      EpisodeSchema.parse(a.episode);
      GhostTraceSchema.parse(a.ghost);
    }
  });

  it('prints the balance table', async () => {
    const rows: string[] = [];
    for (const missionId of MISSION_IDS) {
      for (const preset of Object.values(PRESETS)) {
        for (const [name, brain] of [['heuristic', heuristicBrain], ['random', randomBrain(7)]] as const) {
          const start = performance.now();
          const { episode } = await runHeadless(MISSIONS[missionId], 7, preset.build, brain);
          const o = episode.outcome;
          rows.push(
            `${missionId} ${preset.id.padEnd(12)} ${name.padEnd(9)} ${o.finished ? 'FIN' : `DNF:${o.dnfReason}`.padEnd(3)} t=${o.timeS.toFixed(1)} dmg=${o.damagePct} en=${o.energyUsedPct} score=${o.score} stars=${o.stars} dec=${episode.decisions.length} ${(performance.now() - start).toFixed(0)}ms | ${o.why}`,
          );
        }
      }
    }
    console.log(rows.join('\n'));
  }, 30000);

  it('runController plays M1 to the finish and emits the event stream', async () => {
    const events: RunEvent[] = [];
    const controller = runController(
      { mission: MISSIONS.M1, seed: 7, build: PRESETS.all_rounder.build, priority: 0.5 },
      heuristicBrain,
      { onEvent: (event) => events.push(event), timeScale: 40 },
    );
    const episode = await controller.start();
    expect(episode.outcome.finished).toBe(true);
    expect(episode.policy).toBe('heuristic');
    expect(events.at(-1)?.type).toBe('finish');
    expect(events.some((e) => e.type === 'decision')).toBe(true);
    EpisodeSchema.parse(episode);
  }, 20000);
});
