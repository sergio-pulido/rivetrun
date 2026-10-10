'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Build, MissionId, Plan, PresetId } from '@rivetrun/contracts';
import { PRESETS } from '@rivetrun/sim';
import { JoinResponseSchema, RaceSnapshotSchema, type ArenaBrainId } from '../race/_lib/protocol';
import { postRaceAction } from '../race/_lib/useRaceRoom';
import styles from './screen.module.css';

interface LauncherProps {
  readonly missionId: MissionId;
  readonly presetId: PresetId;
  /** The Lab's edited orders; absent = the pregenerated plan's own. */
  readonly briefing?: string;
  readonly priority?: number;
}

interface Lane {
  readonly model: ArenaBrainId;
  readonly plan: boolean;
}
/** The "Race in Arena" room (docs/PLAY_AND_PLAN.md §3): the plan against no plan, and a fast model against one that reasons while it drives. */
const LANES: readonly Lane[] = [
  { model: 'jev-1.13.0', plan: true },
  { model: 'jev-1.13.0', plan: false },
  { model: 'gpt-6.1-sol', plan: false },
  { model: 'gpt-6-luna', plan: true },
];

/**
 * /screen?arena=plan&mission=M1&preset=all_rounder[&briefing=…&priority=…] — opens a room, seats the four lanes
 * and hands over to the room's big screen. This page holds the bots' seats, so it must be the one that adds them.
 */
export function ArenaPlanLauncher({ missionId, presetId, briefing, priority }: LauncherProps) {
  const router = useRouter();
  const [note, setNote] = useState('Opening the Arena room…');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const file = (await (await fetch(`/api/plan?missionId=${missionId}`, { cache: 'no-store' })).json()) as { plans?: Record<string, Plan> };
        const plan = file.plans?.[presetId] ?? file.plans?.all_rounder;
        if (!plan) throw new Error(`No plan for ${missionId} yet.`);
        const orders = { briefing: (briefing ?? plan.briefing).slice(0, 140), priority: priority ?? plan.priority };
        const response = await fetch('/api/race', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ missionId }) });
        if (!response.ok) throw new Error(`The room did not open (${response.status}).`);
        const room = RaceSnapshotSchema.parse(await response.json());
        const seats: { playerId: string; token: string }[] = [];
        for (const lane of LANES) {
          const build: Build = lane.plan ? plan.build : PRESETS[presetId].build;
          const seat = JoinResponseSchema.parse(await postRaceAction(room.code, { action: 'addBot', model: lane.model, build, ...(lane.plan ? { ...orders, plan: true } : {}) }));
          seats.push({ playerId: seat.playerId, token: seat.token });
        }
        // The same key useJevBots reads: the room's screen in this tab then runs these four bots.
        sessionStorage.setItem(`rivetrun.race.bots.${room.code}`, JSON.stringify(seats));
        router.replace(`/screen?room=${room.code}&arena=1`);
      } catch (cause) {
        setNote(cause instanceof Error ? cause.message : 'The Arena room did not open.');
      }
    })();
  }, [missionId, presetId, briefing, priority, router]);

  return (
    <div className={styles.stage}>
      <div className={styles.emptyLane} style={{ width: '60vw' }}>
        {note}
      </div>
    </div>
  );
}
