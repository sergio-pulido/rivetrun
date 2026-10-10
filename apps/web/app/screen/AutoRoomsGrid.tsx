'use client';

import { BRIEFING_PRESETS } from '@rivetrun/contracts';
import { MISSIONS, PRESETS } from '@rivetrun/sim';
import { useEffect, useState, type CSSProperties } from 'react';
import { z } from 'zod';
import { ARENA_BRAINS, RaceSnapshotSchema, rankPlayers, resultText, type RacePlayer, type RaceSnapshot } from '../race/_lib/protocol';

// /screen?mode=play: the live auto rooms (RR-PLAN §7), up to eight tiles. Each tile shows its lanes as progress bars
// with the vehicle, agent and strategy each phone picked, and the countdown or the places.
// Mount with one line: <AutoRoomsGrid />. It polls GET /api/race/match, one request at a time.

const POLL_MS = 500;
const MAX_TILES = 8;
const ListSchema = z.object({ rooms: z.array(RaceSnapshotSchema), serverNow: z.number() });

const COLORS = { panel: '#161B22', line: '#2A323D', text: '#E6EDF3', dim: '#8B98A8', accent: '#FF7A1A', jev: '#3FD0E0', ok: '#5BD68A', out: '#6B7480' } as const;
const chip: CSSProperties = { border: `1px solid ${COLORS.line}`, borderRadius: 4, padding: '0 5px', fontSize: 11, lineHeight: '16px', color: COLORS.dim, whiteSpace: 'nowrap' };

const trackLengthM = (snapshot: RaceSnapshot): number => MISSIONS[snapshot.missionId].track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);

function agentLabel(player: RacePlayer): string {
  if (player.kind === 'human') return 'You drive';
  return ARENA_BRAINS.find((brain) => brain.id === player.model)?.label ?? 'Jev';
}

function strategyLabel(player: RacePlayer): string | null {
  const strategy = player.pick?.strategy;
  if (strategy === undefined) return player.plan ? 'plan' : null;
  // "plan" is only claimed when a stored plan was really applied to this lane.
  if (strategy === 'plan') return player.plan ? 'plan ★' : player.kind === 'human' ? 'plan' : 'no plan stored';
  return BRIEFING_PRESETS.find((preset) => preset.id === strategy)?.name ?? strategy;
}

const vehicleLabel = (player: RacePlayer): string | null => (player.pick ? PRESETS[player.pick.presetId].name : null);

function headline(snapshot: RaceSnapshot, now: number): string {
  if (snapshot.status === 'lobby') return `STARTS IN ${Math.max(0, Math.ceil(((snapshot.auto?.endsAt ?? now) - now) / 1000))} s`;
  if (snapshot.status === 'countdown') return `GO IN ${Math.max(0, Math.ceil(((snapshot.startAt ?? now) - now) / 1000))}`;
  if (snapshot.status === 'racing') return 'RACING';
  return 'RESULTS';
}

function Tile({ snapshot, index, now }: { readonly snapshot: RaceSnapshot; readonly index: number; readonly now: number }) {
  const lengthM = trackLengthM(snapshot);
  const finished = snapshot.status === 'finished';
  const lanes = finished || snapshot.status === 'racing' ? rankPlayers(snapshot.players) : [...snapshot.players].sort((a, b) => a.lane - b.lane);
  return (
    <section data-testid="auto-room" style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 10, minWidth: 0 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <strong style={{ color: COLORS.text, fontSize: 13, letterSpacing: 1 }}>ROOM {index + 1}</strong>
        <span data-testid="auto-room-state" style={{ color: snapshot.status === 'lobby' ? COLORS.accent : COLORS.dim, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {headline(snapshot, now)}
        </span>
      </header>
      {lanes.map((player, place) => {
        const share = Math.max(0, Math.min(1, player.x / lengthM));
        const out = player.done && !player.finished;
        const color = out ? COLORS.out : player.kind === 'jev' ? COLORS.jev : COLORS.accent;
        const strategy = strategyLabel(player);
        const vehicle = vehicleLabel(player);
        return (
          <div key={player.id} data-testid="auto-room-lane" style={{ marginBottom: 5 }}>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', minWidth: 0 }}>
              {finished ? <span style={{ color: COLORS.dim, fontSize: 12, width: 14 }}>{place + 1}</span> : null}
              <span style={{ color: COLORS.text, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' }}>{player.nickname}</span>
              {vehicle ? <span style={chip}>{vehicle}</span> : null}
              <span style={{ ...chip, color: player.kind === 'jev' ? COLORS.jev : COLORS.dim }}>{agentLabel(player)}</span>
              {strategy ? <span style={chip}>{strategy}</span> : null}
              {player.done ? <span style={{ color: player.finished ? COLORS.ok : COLORS.out, fontSize: 12, whiteSpace: 'nowrap' }}>{resultText(player, lengthM)}</span> : null}
            </div>
            <div style={{ height: 5, background: COLORS.line, borderRadius: 3, marginTop: 2 }}>
              <div style={{ width: `${(player.finished ? 1 : share) * 100}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s linear' }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** The live auto rooms as a grid of tiles. `test` shows the load test's rooms instead (for watching a load test). */
export function AutoRoomsGrid({ test = false }: { readonly test?: boolean }) {
  const [rooms, setRooms] = useState<readonly RaceSnapshot[]>([]);
  const [offsetMs, setOffsetMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let closed = false;
    let busy = false;
    const read = async (): Promise<void> => {
      if (busy) return; // one request at a time
      busy = true;
      try {
        const response = await fetch(`/api/race/match${test ? '?test=1' : ''}`, { cache: 'no-store' });
        const parsed = ListSchema.safeParse(response.ok ? await response.json() : null);
        if (closed) return;
        setFailed(!parsed.success);
        if (parsed.success) {
          setRooms(parsed.data.rooms.slice(0, MAX_TILES));
          setOffsetMs(parsed.data.serverNow - Date.now());
        }
      } catch {
        if (!closed) setFailed(true);
      } finally {
        busy = false;
      }
    };
    void read();
    const poller = setInterval(() => void read(), POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 250);
    return () => {
      closed = true;
      clearInterval(poller);
      clearInterval(clock);
    };
  }, [test]);

  if (rooms.length === 0) {
    return (
      <p data-testid="auto-rooms-empty" style={{ color: COLORS.dim, fontSize: 16, textAlign: 'center', padding: 16 }}>
        {failed ? 'The rooms are not answering. Retrying…' : 'No room open. Scan the code: the first phone opens one, and it starts 30 s later.'}
      </p>
    );
  }
  return (
    <div data-testid="auto-rooms" style={{ display: 'grid', gridTemplateColumns: `repeat(${rooms.length > 4 ? 4 : Math.max(1, Math.min(rooms.length, 2))}, minmax(0, 1fr))`, gap: 10 }}>
      {rooms.map((snapshot, index) => (
        <Tile key={snapshot.code} snapshot={snapshot} index={index} now={now + offsetMs} />
      ))}
    </div>
  );
}
