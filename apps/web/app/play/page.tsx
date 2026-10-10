import type { Metadata } from 'next';
import { ARENA_BRAINS } from '../race/_lib/protocol';
import { arenaResults } from '@/ui/lab/arenaData';
import { pregeneratedPlans } from '@/ui/lab/planData';
import { Play, type PlayAgent, type PlayPlans } from '@/ui/play/Play';

export const metadata: Metadata = { title: 'Play · RivetRun' };
// The arena results and the pregenerated plans are files that change while the app runs.
export const dynamic = 'force-dynamic';

/** The agents a phone may pick (docs/PLAY_AND_PLAN.md §4), by their arena contestant ids. */
const AGENT_IDS: readonly string[] = ['jev-1.13.0', 'gpt-6-luna', 'deepseek-flash'];

export default function PlayPage() {
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
  return <Play agents={agents} plans={plans} />;
}
