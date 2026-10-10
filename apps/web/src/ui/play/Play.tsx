'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_PLAY_PICK, PresetIdSchema, type MissionId, type PlayerPick, type PresetId } from '@rivetrun/contracts';
import { MISSIONS, PRESETS } from '@rivetrun/sim';
import { TERRAIN_LOOK } from '@/game/palette';
// The Room Race's own robot drawing, for a preset whose render cannot be loaded.
import { RobotGlyph } from '../../../app/race/_lib/RobotGlyph';
import { AppHeader } from '@/ui/AppHeader';
import { Icon } from '@/ui/Icon';
import { MissionArt } from '@/ui/MissionArt';
import { MISSION_AUTO_MS, after, planTitle, readMatch, ringLeft, secondsLeft, stepsOf, type Seat, type Stage, type Step } from './match';

export interface PlayAgent {
  readonly id: string;
  readonly label: string;
  /** Median response time in the arena, ms; null when the results have none. */
  readonly p50Ms: number | null;
}

/** Mission id → preset id → the pregenerated plan's one-line reason and the model that wrote it. */
export type PlayPlans = Readonly<Record<string, Readonly<Record<string, { readonly rationale: string; readonly model: string }>>>>;

interface Room {
  readonly code: string;
  readonly endsAt: number;
  readonly seat: Seat | null;
  readonly clockOffsetMs: number;
}

/** 'choosing' = on the mission step: no room is asked for until a mission is taken. */
type Match = { readonly kind: 'choosing' } | { readonly kind: 'matching' } | { readonly kind: 'room'; readonly room: Room } | { readonly kind: 'wait'; readonly until: number } | { readonly kind: 'unavailable' };

const HUMAN = 'human';
const PRESET_IDS = Object.keys(PRESETS) as readonly PresetId[];
const STEP_TITLE: Readonly<Record<Step, string>> = { mission: 'Pick a mission', vehicle: 'Pick your robot', agent: 'Who drives it?' };
const CARD = 'flex min-h-[76px] w-full items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-left transition-transform active:scale-[0.98]';
const cardLook = (on: boolean, tone: 'player' | 'brain' = 'player'): string => `${CARD} ${on ? (tone === 'brain' ? 'border-cyan bg-cyan-deep' : 'border-orange bg-[#1F150C]') : 'border-line-2 bg-panel'}`;
const POLL_MS = 1000;
/** If the room has not reported its start by then, the race page takes over anyway: it shows whatever state the room is in. */
const START_GRACE_MS = 2000;

/** The seat is kept where the race page looks for it, so it opens on the player's own robot without a join form. */
function keepSeat(room: Room): void {
  if (!room.seat) return;
  try {
    sessionStorage.setItem(`rivetrun.race.${room.code}`, JSON.stringify(room.seat));
  } catch {
    // Private mode: the race page will ask the player to join instead.
  }
}

/**
 * The preset as rendered from its exact build (public/renders/presets); the drawn robot if the image does not load.
 * The renders are square with the robot in the middle band, so the slot crops the empty top and bottom.
 */
function PresetArt({ id }: { readonly id: PresetId }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <RobotGlyph build={PRESETS[id].build} color="#ff6a13" className="h-12 w-[70px] shrink-0" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/renders/presets/${id}.webp`} alt="" width={104} height={72} onError={() => setFailed(true)} className="h-[72px] w-[104px] shrink-0 object-cover" />;
}

function Ring({ left, seconds }: { readonly left: number; readonly seconds: number }) {
  const [radius, around] = [26, 2 * Math.PI * 26];
  return (
    <span className="relative grid h-16 w-16 shrink-0 place-items-center" role="timer" aria-label={`${seconds} seconds until the race starts`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--color-line-2)" strokeWidth="6" />
        <circle cx="32" cy="32" r={radius} fill="none" stroke={seconds <= 5 ? 'var(--color-warn)' : 'var(--color-orange)'} strokeWidth="6" strokeLinecap="round" strokeDasharray={around} strokeDashoffset={around * (1 - left)} />
      </svg>
      <span className="font-mono text-xl font-semibold tabular-nums" data-testid="play-countdown">
        {seconds}
      </span>
    </span>
  );
}

interface ChoiceProps {
  readonly testId: string;
  readonly on: boolean;
  readonly tone?: 'player' | 'brain';
  readonly onPick: () => void;
  readonly lead?: ReactNode;
  readonly title: string;
  readonly line: string;
  readonly side?: string;
}

function Choice({ testId, on, tone, onPick, lead, title, line, side }: ChoiceProps) {
  return (
    <button type="button" data-testid={testId} aria-pressed={on} onClick={onPick} className={cardLook(on, tone)}>
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xl font-bold leading-tight">{title}</span>
        <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-text-2">{line}</span>
      </span>
      {side ? <span className="shrink-0 text-right font-mono text-xs tabular-nums text-text-2">{side}</span> : null}
      {on ? <Icon name="check" size={22} className={`shrink-0 ${tone === 'brain' ? 'text-cyan' : 'text-orange'}`} /> : null}
    </button>
  );
}

interface PlayProps {
  readonly agents: readonly PlayAgent[];
  readonly plans: PlayPlans;
  /** The missions a phone may ask a room for, the Play mission first. */
  readonly missions: readonly MissionId[];
  /** The mission of a phone that does not choose. */
  readonly defaultMission: MissionId;
  /** Start with the mission tap; without it the phone is matched on load into the default mission. */
  readonly missionStep: boolean;
}

/**
 * /play: one QR, no room code. Taps: mission (when that step is on), vehicle, driver. The phone is matched into a room
 * for its mission and the room's 30 seconds start then. The highlighted choice is the default and applies without a
 * tap. There is no strategy tap: an AI driver uses the plan made for the mission and the vehicle.
 */
export function Play({ agents, plans, missions, defaultMission, missionStep }: PlayProps) {
  const router = useRouter();
  const [match, setMatch] = useState<Match>(missionStep ? { kind: 'choosing' } : { kind: 'matching' });
  const [stage, setStage] = useState<Stage>(missionStep ? 'mission' : 'vehicle');
  const [pick, setPick] = useState<PlayerPick>({ ...DEFAULT_PLAY_PICK, agent: agents[0]?.id ?? HUMAN });
  const [missionId, setMissionId] = useState<string | null>(null);
  // The mission highlighted on the mission step: "?mission=<id>" (Home's PLAY NOW) or the Play mission.
  const [highlighted, setHighlighted] = useState<MissionId>(defaultMission);
  const [now, setNow] = useState(() => Date.now());
  const [openedAt] = useState(() => Date.now());
  const asked = useRef(false);
  const left = useRef(false);
  /** The mission asked for, kept for the retry after "Next race in N s". */
  const wanted = useRef<MissionId | null>(null);

  const findRoom = useCallback(async (mission: MissionId | null = wanted.current): Promise<void> => {
    wanted.current = mission;
    setMatch({ kind: 'matching' });
    let answer: ReturnType<typeof readMatch>;
    try {
      // "?test=1" asks for a test room: those stay off every board (the load test and the e2e use them).
      const test = new URLSearchParams(window.location.search).get('test') === '1';
      const response = await fetch('/api/race/match', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(test ? { test: true } : {}), ...(mission ? { missionId: mission } : {}) }), cache: 'no-store' });
      answer = readMatch(response.status, await response.json().catch(() => null), Date.now());
    } catch {
      answer = { kind: 'unavailable' };
    }
    if (answer.kind === 'room') {
      keepSeat(answer);
      setMatch({ kind: 'room', room: answer });
    } else if (answer.kind === 'wait') setMatch({ kind: 'wait', until: Date.now() + answer.seconds * 1000 });
    else setMatch({ kind: 'unavailable' });
  }, []);

  // Matched once per visit: a second request would take a second seat. With the mission step, only once a mission is taken.
  useEffect(() => {
    if (missionStep || asked.current) return;
    asked.current = true;
    void findRoom(null);
  }, [findRoom, missionStep]);

  const takeMission = useCallback(
    (mission: MissionId): void => {
      if (asked.current) return;
      asked.current = true;
      setHighlighted(mission);
      setMissionId(mission);
      setStage('vehicle');
      void findRoom(mission);
    },
    [findRoom],
  );

  useEffect(() => {
    const asked4 = new URLSearchParams(window.location.search).get('mission');
    const known = missions.find((mission) => mission === asked4);
    if (known) setHighlighted(known);
  }, [missions]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const room = match.kind === 'room' ? match.room : null;

  // "/play?preset=<id>" (Home's "Race with it") arrives with that robot chosen. The server's default is another one,
  // so the choice is sent as soon as there is a seat: what the phone shows is what the room holds.
  const [arrivedWith, setArrivedWith] = useState<PresetId | null>(null);
  useEffect(() => {
    const preset = PresetIdSchema.safeParse(new URLSearchParams(window.location.search).get('preset'));
    if (!preset.success) return;
    setArrivedWith(preset.data);
    setPick((current) => ({ ...current, presetId: preset.data }));
  }, []);
  useEffect(() => {
    if (!room?.seat || !arrivedWith) return;
    void fetch(`/api/race/${room.code}/pick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...room.seat, pick: { ...DEFAULT_PLAY_PICK, agent: agents[0]?.id ?? HUMAN, presetId: arrivedWith } }), cache: 'no-store' }).catch(() => undefined);
    // Sent once per room: later taps send the whole pick themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code, arrivedWith]);

  const serverNow = now + (room?.clockOffsetMs ?? 0);

  const enterRace = useCallback(
    (code: string): void => {
      if (left.current) return;
      left.current = true;
      router.replace(`/race/${code}`);
    },
    [router],
  );

  // The room is read once a second, one request at a time and without an event stream (quick tunnels do not carry one).
  useEffect(() => {
    if (!room) return;
    let busy = false;
    const read = async (): Promise<void> => {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch(`/api/race/${room.code}`, { cache: 'no-store' });
        const snapshot = response.ok ? ((await response.json()) as { readonly status?: unknown; readonly missionId?: unknown }) : null;
        if (typeof snapshot?.missionId === 'string') setMissionId(snapshot.missionId);
        if (typeof snapshot?.status === 'string' && snapshot.status !== 'lobby') enterRace(room.code);
      } catch {
        // A missed read: the next one, or the countdown, moves the phone on.
      } finally {
        busy = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), POLL_MS);
    return () => clearInterval(timer);
  }, [room, enterRace]);

  useEffect(() => {
    if (room && serverNow >= room.endsAt + START_GRACE_MS) enterRace(room.code);
  }, [room, serverNow, enterRace]);

  // An untouched phone takes the highlighted mission by itself: defaults never need a tap.
  const autoInS = match.kind === 'choosing' ? Math.max(0, Math.ceil((openedAt + MISSION_AUTO_MS - now) / 1000)) : null;
  useEffect(() => {
    if (match.kind === 'choosing' && now >= openedAt + MISSION_AUTO_MS) takeMission(highlighted);
  }, [match.kind, now, openedAt, highlighted, takeMission]);

  // "Next race in N s": asked again when the wait is over.
  useEffect(() => {
    if (match.kind === 'wait' && now >= match.until) void findRoom();
  }, [match, now, findRoom]);

  const choose = (patch: Partial<PlayerPick>): void => {
    const next = { ...pick, ...patch };
    setPick(next);
    setStage(after(stage));
    if (!room?.seat) return;
    // The whole pick goes with every tap, so the last one the server holds is complete. Never free text.
    void fetch(`/api/race/${room.code}/pick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...room.seat, pick: next }), cache: 'no-store' }).catch(() => undefined);
  };

  const plan = missionId ? (plans[missionId]?.[pick.presetId] ?? null) : null;
  const agentLabel = pick.agent === HUMAN ? 'You drive' : (agents.find((agent) => agent.id === pick.agent)?.label ?? pick.agent);
  const steps = stepsOf(missionStep);
  const dataStep = match.kind === 'room' ? stage : match.kind === 'choosing' ? 'mission' : match.kind;
  const mission = MISSIONS[missions.find((id) => id === missionId) ?? defaultMission];

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-3 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-[max(14px,env(safe-area-inset-top))]" data-testid="play" data-step={dataStep}>
      <AppHeader variant="logo" />

      {match.kind === 'matching' ? (
        <p className="rr-card mt-6 p-5 text-center font-display text-2xl font-bold" role="status">
          Finding you a race…
        </p>
      ) : null}

      {match.kind === 'wait' ? (
        <div className="rr-card mt-6 flex flex-col gap-1.5 p-5 text-center" role="status">
          <p className="font-display text-2xl font-bold" data-testid="play-wait">
            Next race in {Math.max(0, Math.ceil((match.until - now) / 1000))} s
          </p>
          <p className="text-sm leading-snug text-text-2">Every room is racing. You join the next one on your own: nothing to tap.</p>
        </div>
      ) : null}

      {match.kind === 'unavailable' ? (
        <div className="rr-card mt-6 flex flex-col gap-3 p-5 text-center" role="alert">
          <p className="font-display text-2xl font-bold">No race to join right now</p>
          <p className="text-sm leading-snug text-text-2">The matchmaker did not answer. You can try again, or join a room with a code.</p>
          <button type="button" onClick={() => void findRoom()} className="rr-btn rr-btn-primary">
            Try again
          </button>
          <Link href="/race" className="rr-btn rr-btn-secondary">
            Room Race with a code
          </Link>
        </div>
      ) : null}

      {match.kind === 'choosing' ? (
        <>
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[1.5px] text-muted">step 1 of {steps.length}</p>
            <h1 className="font-display text-[30px] font-bold leading-none">{STEP_TITLE.mission}</h1>
          </div>
          <div className="flex flex-col gap-2.5" role="group" aria-label="Mission">
            {missions.map((id) => {
              const option = MISSIONS[id];
              const length = option.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
              const on = id === highlighted;
              return (
                <button key={id} type="button" data-testid={`play-mission-${id}`} aria-pressed={on} onClick={() => takeMission(id)} className={`${cardLook(on)} !flex-col !items-stretch !gap-1.5`}>
                  <span className="flex items-center justify-between gap-2 font-mono text-[11px] font-medium uppercase tracking-[1px]">
                    <span className="text-orange-soft">
                      Mission 0{id.slice(1)} · {length} m
                    </span>
                    <span className="flex items-center gap-1.5">
                      {id === defaultMission ? <span className="rounded bg-orange px-1.5 py-0.5 text-[10px] font-semibold text-on-orange">Play mission</span> : null}
                      <span className="rounded border border-line-3 px-1.5 py-0.5 text-[10px] text-muted">{option.weather}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    {/* The mission's thumbnail; without it the card is its text alone. */}
                    <MissionArt id={id} className="h-[68px] w-[120px] shrink-0 rounded-lg object-cover" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-display text-xl font-bold leading-tight">{option.name}</span>
                      <span className="line-clamp-2 text-[13px] leading-snug text-text-2">{option.description}</span>
                    </span>
                  </span>
                  <span className="flex h-1.5 overflow-hidden rounded-sm">
                    {option.track.segments.map((segment, index) => (
                      <span key={index} style={{ width: `${(segment.lengthM / length) * 100}%`, background: TERRAIN_LOOK[segment.terrain].hud }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-auto pt-1 text-center text-[13px] leading-snug text-muted" role="status">
            No tap needed: the highlighted mission starts in <span data-testid="play-mission-auto">{autoInS}</span> s.
          </p>
        </>
      ) : null}

      {room ? (
        <>
          <div className="flex items-center gap-3">
            <Ring left={ringLeft(room.endsAt, serverNow)} seconds={secondsLeft(room.endsAt, serverNow)} />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[1.5px] text-muted">
                Room <span data-testid="play-room">{room.code}</span> · {stage === 'waiting' ? 'you are in' : `step ${steps.indexOf(stage as Step) + 1} of ${steps.length}`}
              </p>
              <h1 className="font-display text-[30px] font-bold leading-none">{stage === 'waiting' ? 'Get ready' : STEP_TITLE[stage]}</h1>
              <p className="mt-1 truncate font-mono text-[11px] uppercase tracking-[1px] text-text-2" data-testid="play-mission">
                Mission 0{mission.id.slice(1)} · {mission.name}
              </p>
            </div>
          </div>

          {stage === 'vehicle' ? (
            <div className="flex flex-col gap-2.5" role="group" aria-label="Vehicle">
              {PRESET_IDS.map((id) => (
                <Choice
                  key={id}
                  testId={`play-vehicle-${id}`}
                  on={pick.presetId === id}
                  onPick={() => choose({ presetId: id })}
                  lead={<PresetArt id={id} />}
                  title={PRESETS[id].name}
                  line={PRESETS[id].blurb}
                />
              ))}
            </div>
          ) : null}

          {stage === 'agent' ? (
            <div className="flex flex-col gap-2.5" role="group" aria-label="Agent">
              {agents.map((agent) => (
                <Choice
                  key={agent.id}
                  testId={`play-agent-${agent.id}`}
                  tone="brain"
                  on={pick.agent === agent.id}
                  onPick={() => choose({ agent: agent.id })}
                  title={agent.label}
                  line={plan ? `Drives with ${planTitle(plan.model)}. You watch your robot race.` : 'An AI drives. You watch your robot race.'}
                  side={agent.p50Ms === null ? undefined : `answers in ${Math.round(agent.p50Ms)} ms`}
                />
              ))}
              <Choice testId="play-agent-human" on={pick.agent === HUMAN} onPick={() => choose({ agent: HUMAN })} title="You drive" line="Your thumbs on the throttle and the brake." />
            </div>
          ) : null}

          {stage === 'waiting' ? (
            <div className="flex flex-col gap-2.5" role="status">
              {(
                [
                  ['vehicle', 'Robot', PRESETS[pick.presetId].name],
                  ['agent', 'Driver', pick.agent !== HUMAN && plan ? `${agentLabel} · ${planTitle(plan.model)}` : agentLabel],
                ] as const
              ).map(([step, label, value]) => (
                <button key={step} type="button" onClick={() => setStage(step)} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line-2 bg-panel px-4 text-left">
                  <span className="font-mono text-[11px] font-medium uppercase tracking-[1.5px] text-muted">{label}</span>
                  <span className="min-w-0 flex-1 truncate text-right font-display text-lg font-bold">{value}</span>
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[1px] text-orange-soft">change</span>
                </button>
              ))}
              <p className="pt-1 text-center text-sm leading-snug text-text-2">The race starts when the ring is empty. Keep this page open.</p>
            </div>
          ) : (
            <p className="mt-auto pt-1 text-center text-[13px] leading-snug text-muted">No tap needed: the highlighted one is used when the ring is empty.</p>
          )}
        </>
      ) : null}
    </main>
  );
}
