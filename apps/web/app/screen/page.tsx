import type { Metadata } from 'next';
import { resolveSiteUrl } from '../leaderboard/_lib/siteUrl';
import { RaceCodeSchema } from '../race/_lib/protocol';
import { MissionIdSchema, PresetIdSchema, PrioritySchema } from '@rivetrun/contracts';
import { ARENA_DEMO_MISSION } from '@/play/playMission';
import { ArenaPlanLauncher } from './ArenaPlanLauncher';
import { PlayScreen } from './PlayScreen';
import { RaceScreen } from './RaceScreen';
import { ScreenClient } from './ScreenClient';

export const metadata: Metadata = { title: 'Room Challenge · RivetRun' };
export const dynamic = 'force-dynamic';

interface ScreenPageProps {
  searchParams: Promise<{ room?: string | string[]; arena?: string | string[]; mode?: string | string[]; mission?: string | string[]; preset?: string | string[]; briefing?: string | string[]; priority?: string | string[] }>;
}

// /screen — Room Challenge leaderboard. /screen?room=ABCD — that room's Room Race. Add &arena=1 for the live Arena race.
export default async function ScreenPage({ searchParams }: ScreenPageProps) {
  const siteUrl = await resolveSiteUrl();
  const params = await searchParams;
  // ?mode=play: the hands-on screen (a big QR to the Home page and the room's own runs).
  if (params.mode === 'play') return <PlayScreen siteUrl={siteUrl} />;
  // ?arena=plan&mission=&preset=[&briefing=&priority=]: the Lab's "Race in Arena" — opens a room with the four plan lanes.
  if (params.arena === 'plan') {
    const mission = MissionIdSchema.safeParse(params.mission);
    const preset = PresetIdSchema.safeParse(params.preset);
    const priority = PrioritySchema.safeParse(typeof params.priority === 'string' ? Number(params.priority) : undefined);
    return (
      <ArenaPlanLauncher
        missionId={mission.success ? mission.data : ARENA_DEMO_MISSION}
        presetId={preset.success ? preset.data : 'all_rounder'}
        briefing={typeof params.briefing === 'string' && params.briefing.trim() ? params.briefing.trim().slice(0, 140) : undefined}
        priority={priority.success ? priority.data : undefined}
      />
    );
  }
  const room = RaceCodeSchema.safeParse(params.room);
  // ?arena=1: the host bar offers one bot per brain (the live Arena race) instead of JEV bots.
  if (room.success) return <RaceScreen code={room.data} siteUrl={siteUrl} arena={params.arena === '1'} />;
  return <ScreenClient siteUrl={siteUrl} />;
}
