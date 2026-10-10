import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import pack from './samplePack.json';
import { CUE_RULES, newCueMemory, raceCues, type CuePlayer, type CueRoom } from './sampleCues';
import { AMBIENCE_NAMES, SAMPLE_NAMES, announce, hasSample, missionAmbience, playSample, sampleUrl, setAmbience, type SampleName } from './samples';

interface Entry { readonly kind: string; readonly bytes: number; readonly seconds: number | null; readonly meanDb: number | null; readonly peakDb: number | null; readonly levelled: boolean }
const files = pack.files as Record<string, Entry>;
const onDisk = (name: string): string => fileURLToPath(new URL(`../../../public/sfx/${name}.mp3`, import.meta.url));
const BUDGET_BYTES = 2.5 * 1024 * 1024;
const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

describe('the recorded sound pack (RR-SOUND)', () => {
  it('indexes only sounds of the pack, each on disk at its recorded size, within 2.5 MB', () => {
    let total = 0;
    for (const [name, entry] of Object.entries(files)) {
      expect(SAMPLE_NAMES, name).toContain(name);
      expect(existsSync(onDisk(name)), name).toBe(true);
      expect(statSync(onDisk(name)).size, name).toBe(entry.bytes);
      total += entry.bytes;
    }
    expect(total).toBeLessThanOrEqual(BUDGET_BYTES);
  });

  it('has no silent file and no clipped one, by the levels measured when the pack was written', () => {
    for (const [name, entry] of Object.entries(files)) {
      expect(entry.meanDb, `${name} mean level`).not.toBeNull();
      expect(entry.meanDb!, `${name} is silent`).toBeGreaterThan(-60);
      expect(entry.peakDb!, `${name} clips`).toBeLessThan(-0.1);
      expect(entry.seconds!, `${name} length`).toBeGreaterThan(0.3);
    }
  });

  it.skipIf(!ffmpeg)('renders every file offline again: audible, below full scale, and the one the index measured', () => {
    for (const [name, entry] of Object.entries(files)) {
      const out = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-i', onDisk(name), '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
      const mean = Number(out.match(/mean_volume: (-?[\d.]+) dB/)?.[1]);
      const peak = Number(out.match(/max_volume: (-?[\d.]+) dB/)?.[1]);
      expect(mean, `${name} is silent`).toBeGreaterThan(-60);
      expect(peak, `${name} clips`).toBeLessThan(-0.1);
      expect(Math.abs(mean - entry.meanDb!), `${name} is not the file the index measured`).toBeLessThan(0.5);
    }
  });

  it('keeps the ambience under the stingers and the announcer', () => {
    const level = (kind: string): number[] => Object.values(files).filter((entry) => entry.kind === kind).map((entry) => entry.meanDb!);
    const loudestAmbience = Math.max(-Infinity, ...level('ambience'));
    for (const other of [...level('shot'), ...level('voice')]) expect(other).toBeGreaterThan(loudestAmbience);
  });

  it('asks the server for nothing the pack does not have, and for nothing at all before a gesture', () => {
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    const absent = SAMPLE_NAMES.filter((name) => !hasSample(name));
    for (const name of AMBIENCE_NAMES) setAmbience(name, 'screen');
    playSample('fx_race_go');
    announce('vo_countdown');
    setAmbience(null);
    expect(fetched).not.toHaveBeenCalled();
    for (const name of absent) expect(Object.hasOwn(files, name)).toBe(false);
    vi.unstubAllGlobals();
  });

  it('names a file per sound under /sfx', () => {
    for (const name of SAMPLE_NAMES) expect(sampleUrl(name)).toBe(`/sfx/${name}.mp3`);
    expect(new Set<SampleName>(SAMPLE_NAMES).size).toBe(SAMPLE_NAMES.length);
  });

  it('gives M7 its ruined city and aftershock, M9 the polar night, rain the storm, and clear missions nothing', () => {
    expect(missionAmbience({ id: 'M7', weather: 'clear' })).toEqual({ name: 'amb_m7_quake', intro: 'fx_quake_tremor' });
    expect(missionAmbience({ id: 'M9', weather: 'cold' })).toEqual({ name: 'amb_m9_polar' });
    expect(missionAmbience({ id: 'M8', weather: 'rain' })).toEqual({ name: 'amb_storm' });
    expect(missionAmbience({ id: 'M5', weather: 'rain' })).toEqual({ name: 'amb_storm' });
    expect(missionAmbience({ id: 'M1', weather: 'clear' })).toBeNull();
  });
});

describe('what the big screen says during a race', () => {
  const lane = (id: string, kind: CuePlayer['kind'], x: number, more: Partial<CuePlayer> = {}): CuePlayer => ({ id, kind, x, finished: false, raceMs: null, lateDecisions: kind === 'jev' ? 0 : null, ...more });
  const room = (status: string, players: CuePlayer[], raceNo = 1): CueRoom => ({ status, raceNo, startAt: 10_000, players });
  /** Feeds snapshots in order and returns the cues of each. */
  const play = (steps: readonly (readonly [CueRoom, number])[]) => {
    let memory = newCueMemory();
    return steps.map(([snapshot, at]) => {
      const out = raceCues(memory, snapshot, at);
      memory = out.memory;
      return out.cues;
    });
  };
  const grid = [lane('h', 'human', 0), lane('j', 'jev', 0)];

  it('says nothing about what is already going on when the screen opens', () => {
    const done = [lane('h', 'human', 30, { finished: true, raceMs: 20_000 }), lane('j', 'jev', 30, { finished: true, raceMs: 20_200 })];
    expect(play([[room('finished', done), 0], [room('finished', done), 200]])).toEqual([[], []]);
  });

  it('counts down, sounds the horn, and calls the lead only when it passes between a human and an AI', () => {
    const cues = play([
      [room('lobby', grid), 0],
      [room('countdown', grid), 1000],
      [room('racing', grid), 4000],
      [room('racing', [lane('h', 'human', 5), lane('j', 'jev', 3)]), 4000 + CUE_RULES.leadQuietMs],
      [room('racing', [lane('h', 'human', 9), lane('j', 'jev', 12)]), 12_000],
      [room('racing', [lane('h', 'human', 14), lane('j', 'jev', 13)]), 13_000],
      [room('racing', [lane('h', 'human', 20), lane('j', 'jev', 18)]), 12_000 + CUE_RULES.leadEveryMs],
    ]);
    expect(cues[0]).toEqual([]);
    expect(cues[1]).toEqual([{ countdown: true }]);
    expect(cues[2]).toEqual([{ shot: 'fx_race_go' }]);
    // The first leader is noted, not announced.
    expect(cues[3]).toEqual([]);
    expect(cues[4]).toEqual([{ voice: 'vo_jev_lead' }]);
    // Back and forth within a few seconds: one call, not a stutter.
    expect(cues[5]).toEqual([]);
    expect(cues[6]).toEqual([{ voice: 'vo_human_lead' }]);
  });

  it('says "still thinking" when a bot reaches a hazard before its answer, and not again straight away', () => {
    const late = (count: number) => room('racing', [lane('h', 'human', 2), lane('j', 'jev', 2, { lateDecisions: count })]);
    const cues = play([[room('countdown', grid), 0], [late(0), 1000], [late(1), 2000], [late(2), 3000], [late(3), 2000 + CUE_RULES.thinkingEveryMs]]);
    expect(cues[2]).toEqual([{ voice: 'vo_thinking' }]);
    expect(cues[3]).toEqual([]);
    expect(cues[4]).toEqual([{ voice: 'vo_thinking' }]);
  });

  it('calls the winner once, by who it is, and a photo finish when the second is under half a second behind', () => {
    const first = [lane('h', 'human', 30, { finished: true, raceMs: 21_000 }), lane('j', 'jev', 29)];
    const both = [first[0]!, lane('j', 'jev', 30, { finished: true, raceMs: 21_300 })];
    const cues = play([[room('racing', grid), 0], [room('racing', first), 21_000], [room('racing', both), 21_400], [room('finished', both), 22_000]]);
    expect(cues[1]).toEqual([{ shot: 'fx_win_sting' }, { voice: 'vo_human_wins' }]);
    expect(cues[2]).toEqual([{ shot: 'fx_photo_finish' }, { voice: 'vo_photo_finish' }]);
    expect(cues[3]).toEqual([]);

    const far = [first[0]!, lane('j', 'jev', 30, { finished: true, raceMs: 24_000 })];
    expect(play([[room('racing', grid), 0], [room('racing', first), 21_000], [room('racing', far), 24_000]])[2]).toEqual([]);
    const ai = [lane('h', 'human', 28), lane('j', 'jev', 30, { finished: true, raceMs: 19_000 })];
    expect(play([[room('racing', grid), 0], [room('racing', ai), 19_000]])[1]).toEqual([{ shot: 'fx_win_sting' }, { voice: 'vo_ai_wins' }]);
  });

  it('starts over with a new race in the same room', () => {
    const won = [lane('h', 'human', 30, { finished: true, raceMs: 21_000 }), lane('j', 'jev', 29)];
    const cues = play([[room('racing', grid), 0], [room('racing', won), 21_000], [room('lobby', grid, 2), 30_000], [room('countdown', grid, 2), 31_000]]);
    expect(cues[2]).toEqual([]);
    expect(cues[3]).toEqual([{ countdown: true }]);
  });
});
