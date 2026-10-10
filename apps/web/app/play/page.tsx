import type { Metadata } from 'next';
import { ARENA_BRAINS } from '../race/_lib/protocol';
import { PLAY_MISSION, PLAY_MISSIONS } from '@/play/playMission';
import { arenaResults } from '@/ui/lab/arenaData';
import { pregeneratedPlans } from '@/ui/lab/planData';
import { playFirst } from '@/ui/home/carousel';
import { MISSION_STEP } from '@/ui/play/match';
import { Play, type PlayAgent, type PlayPlans } from '@/ui/play/Play';

export const metadata: Metadata = { title: 'Play · RivetRun' };
// The arena results and the pregenerated plans are files that change while the app runs.
export const dynamic = 'force-dynamic';

/** The agents a phone may pick (docs/PLAY_AND_PLAN.md §4), by their arena contestant ids. */
const AGENT_IDS: readonly string[] = ['jev-1.13.0', 'gpt-6-luna', 'deepseek-flash'];

export default async function PlayPage({ searchParams }: { searchParams: Promise<{ missions?: string | string[] }> }) {
  // "?missions=1" shows the mission step while it is switched off for everyone else; "?missions=0" hides it.
  const asked = (await searchParams).missions;
  const missionStep = asked === '1' ? true : asked === '0' ? false : MISSION_STEP;
  const arena = arenaResults();
  const agents: readonly PlayAgent[] = ARENA_BRAINS.filter((brain) => AGENT_IDS.includes(brain.id)).map((brain) => ({
    id: brain.id,
    label: brain.label,
    // Median response time from the arena results; left out when the file has none for this brain.
    p50Ms: arena?.contestants.find((entry) => entry.id === brain.id)?.latencyP50Ms ?? null,
  }));
  const plans: PlayPlans = Object.fromEntries(
    Object.entries(pregeneratedPlans()).map(([missionId, byPreset]) => [missionId, Object.fromEntries(Object.entries(byPreset).map(([presetId, plan]) => [presetId, { rationale: plan.rationale, model: plan.generatedBy.model }]))]),
  );
  return <Play agents={agents} plans={plans} missions={playFirst(PLAY_MISSIONS, PLAY_MISSION)} defaultMission={PLAY_MISSION} missionStep={missionStep} />;
}
