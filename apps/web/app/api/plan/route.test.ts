import { PlanSchema } from '@rivetrun/contracts';
import { PRESETS } from '@rivetrun/sim';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PlanFileSchema } from '../_lib/plans';
import { PLAY_MISSION } from '@/play/playMission';
import { GET, POST } from './route';

// The tests run from apps/web, as the server does.
vi.spyOn(process, 'cwd').mockReturnValue(path.resolve(__dirname, '../../..'));

describe('/api/plan', () => {
  it('GET serves the committed plans of the hands-on mission: one valid plan per preset, each naming its model', async () => {
    const response = GET(new Request(`http://localhost/api/plan?missionId=${PLAY_MISSION}`));
    expect(response.status).toBe(200);
    const file = PlanFileSchema.parse(await response.json());
    expect(Object.keys(file.plans).sort()).toEqual(Object.keys(PRESETS).sort());
    for (const plan of Object.values(file.plans)) {
      expect(PlanSchema.safeParse(plan).success).toBe(true);
      expect(plan.briefing.length).toBeLessThanOrEqual(140);
      expect(plan.generatedBy.model.length).toBeGreaterThan(0);
    }
  });

  it('GET is 404 for a mission with no plans and 400 for something that is not a mission', () => {
    expect(GET(new Request('http://localhost/api/plan?missionId=M9')).status).toBe(404);
    expect(GET(new Request('http://localhost/api/plan?missionId=nope')).status).toBe(400);
  });

  it('POST refuses a body that is not { missionId, presetId? } before any model is asked', async () => {
    const post = (body: unknown): Promise<Response> => POST(new Request('http://localhost/api/plan', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
    expect((await post({ missionId: 'nope' })).status).toBe(400);
    expect((await post({ missionId: 'M1', presetId: 'rocket' })).status).toBe(400);
  });
});
