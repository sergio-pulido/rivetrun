import { describe, expect, it } from 'vitest';
import { GET, POST } from './route';
import { POST as PICK } from '../[code]/pick/route';

describe('POST /api/race/match and /api/race/[code]/pick', () => {
  it('seats a phone, takes its pick and lists the room', async () => {
    const matched = await POST(new Request('http://localhost/api/race/match', { method: 'POST', body: JSON.stringify({ test: true }) }));
    expect(matched.status).toBe(200);
    const seat = (await matched.json()) as { code: string; endsAt: number; playerId: string; token: string; nickname: string; serverNow: number };
    expect(seat.code).toMatch(/^[A-Z]{4}$/);
    expect(seat.endsAt - seat.serverNow).toBe(30_000);
    const picked = await PICK(
      new Request(`http://localhost/api/race/${seat.code}/pick`, { method: 'POST', body: JSON.stringify({ playerId: seat.playerId, token: seat.token, pick: { presetId: 'speedster', agent: 'human', strategy: 'eco' }, ready: false }) }),
      { params: Promise.resolve({ code: seat.code }) },
    );
    expect(picked.status).toBe(200);
    const bad = await PICK(
      new Request(`http://localhost/api/race/${seat.code}/pick`, { method: 'POST', body: JSON.stringify({ playerId: seat.playerId, token: seat.token, pick: { presetId: 'speedster', agent: 'human', strategy: 'go fast' } }) }),
      { params: Promise.resolve({ code: seat.code }) },
    );
    expect(bad.status).toBe(400);
    const notOpen = await POST(new Request('http://localhost/api/race/match', { method: 'POST', body: JSON.stringify({ test: true, missionId: 'M1' }) }));
    expect(notOpen.status).toBe(400);
    const notAMission = await POST(new Request('http://localhost/api/race/match', { method: 'POST', body: JSON.stringify({ test: true, missionId: 'M99' }) }));
    expect(notAMission.status).toBe(400);
    const onM9 = await POST(new Request('http://localhost/api/race/match', { method: 'POST', body: JSON.stringify({ test: true, missionId: 'M8' }) }));
    expect(onM9.status).toBe(200);
    const noStrategy = await PICK(
      new Request(`http://localhost/api/race/${seat.code}/pick`, { method: 'POST', body: JSON.stringify({ playerId: seat.playerId, token: seat.token, pick: { presetId: 'speedster', agent: 'human' }, ready: false }) }),
      { params: Promise.resolve({ code: seat.code }) },
    );
    expect(noStrategy.status).toBe(200);
    const listed = (await (await GET(new Request('http://localhost/api/race/match?test=1'))).json()) as { rooms: { code: string }[] };
    expect(listed.rooms.some((room) => room.code === seat.code)).toBe(true);
    const real = (await (await GET(new Request('http://localhost/api/race/match'))).json()) as { rooms: { code: string }[] };
    expect(real.rooms.some((room) => room.code === seat.code)).toBe(false);
  });
});
