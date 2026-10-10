import { ApiErrorSchema, type Episode } from '@rivetrun/contracts';
import { MISSIONS, PRESETS, driveSeed, replayDrive, replayEpisode } from '@rivetrun/sim';
import { describe, expect, it } from 'vitest';
import type { HumanArenaBody } from '../../_lib/humanArena';
import { POST as runs } from '../../runs/route';
import { GET } from './route';

/** A Drive run as a phone would post it: full throttle on M2 from the start, with its input log. */
function drivenEpisode(): Episode {
  const inputLog = [{ t: 0, throttle: 1, brake: 0, action: 'accelerate' as const }];
  const { episode } = replayDrive({ mission: MISSIONS.M2, seed: driveSeed(MISSIONS.M2), build: PRESETS.all_rounder.build, priority: 0.5 }, inputLog);
  return { ...episode, outcome: { ...episode.outcome, breakdown: { ...episode.outcome.breakdown!, inputLog } } };
}

const submit = (nickname: string, episode: Episode): Promise<Response> =>
  runs(new Request('http://localhost/api/runs', { method: 'POST', body: JSON.stringify({ nickname, episode }), headers: { 'content-type': 'application/json' } }));
const arena = async (): Promise<HumanArenaBody> => (await GET().json()) as HumanArenaBody;

describe('humans in the arena', () => {
  it('a Drive run that replays to the posted result becomes the Human row of its mission', async () => {
    const episode = drivenEpisode();
    expect(replayEpisode(episode)).toMatchObject({ ok: true, matches: true });
    expect((await submit('Ada', episode)).status).toBe(200);
    const body = await arena();
    expect(body.verified).toBe(1);
    expect(body.humans).toHaveLength(1);
    expect(body.humans[0]).toMatchObject({ missionId: 'M2', nickname: 'Ada', score: episode.outcome.score, timeS: episode.outcome.timeS, buildName: 'All-rounder', arenaBuild: true, seed: driveSeed(MISSIONS.M2) });
  });

  it('a posted time the input log does not produce is rejected and never reaches the arena or the leaderboard', async () => {
    const real = drivenEpisode();
    const invented: Episode = { ...real, outcome: { ...real.outcome, timeS: real.outcome.timeS - 5, score: real.outcome.score + 200 } };
    const response = await submit('Mallory', invented);
    expect(response.status).toBe(422);
    expect(ApiErrorSchema.parse(await response.json()).error).toContain('the replay of this input log gives');
    const body = await arena();
    expect(body.rejected).toBe(1);
    expect(body.humans.map((row) => row.nickname)).toEqual(['Ada']);
  });

  it('a run that cannot be replayed (no input log) is stored as before but is not a Human row', async () => {
    const real = drivenEpisode();
    const { inputLog: _log, ...breakdown } = real.outcome.breakdown!;
    const response = await submit('Old phone', { ...real, outcome: { ...real.outcome, score: real.outcome.score + 1, breakdown } });
    expect(response.status).toBe(200);
    expect((await arena()).humans.map((row) => row.nickname)).toEqual(['Ada']);
  });

  it('a brain run is not a human run', async () => {
    const real = drivenEpisode();
    expect((await submit('Jev', { ...real, policy: 'heuristic' })).status).toBe(200);
    expect((await arena()).verified).toBe(1);
  });
});
