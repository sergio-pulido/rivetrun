import Link from 'next/link';
import { LAB_RIVAL_LATENCY_MS, LAB_SCENARIO_IDS, LAB_SCENARIOS } from '@rivetrun/lab';
import { MISSIONS } from '@rivetrun/sim';
import { Icon } from '@/ui/Icon';
import { AnalyzePanel } from '@/ui/lab/AnalyzePanel';
import { BrainArena } from '@/ui/lab/BrainArena';
import { arenaResults } from '@/ui/lab/arenaData';
import { howItWasBuilt } from '@/ui/lab/builtData';
import { HowItWasBuilt } from '@/ui/lab/HowItWasBuilt';
import { pregeneratedPlans } from '@/ui/lab/planData';
import { Shell } from '@/ui/Shell';

// The arena results, the git log and the docs are read on each request, so the page follows the repository.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Lab · RivetRun' };

/** docs/PLAY_AND_PLAN.md §1: the planner's default model when PLAN_MODEL is not set. */
const DEFAULT_PLAN_MODEL = 'claude-sonnet-5-5';

export default function LabPage() {
  const scenarioNames = LAB_SCENARIO_IDS.map((id) => LAB_SCENARIOS[id].name);
  const missionNames = Object.fromEntries(Object.values(MISSIONS).map((mission) => [mission.id, mission.name]));
  return (
    <Shell back="/" title="Lab" wide>
      {/* The planner's model as this server is configured; the card names the model that really answered. */}
      <AnalyzePanel missions={Object.values(MISSIONS).map((mission) => ({ id: mission.id, name: mission.name }))} model={process.env.PLAN_MODEL ?? DEFAULT_PLAN_MODEL} pregenerated={pregeneratedPlans()} />

      <BrainArena arena={arenaResults()} ctfRivalMs={LAB_RIVAL_LATENCY_MS} missionNames={missionNames} />

      {/* The one way into Lab Missions for now: not on Home or in the menu until QA has seen it green. */}
      <Link href="/scenarios" data-testid="lab-missions-link" className="rr-card flex items-center gap-3 p-4 active:bg-panel-2 lg:px-6">
        <span className="min-w-0 flex-1">
          <span className="block font-display text-2xl font-bold leading-none">Lab Missions</span>
          <span className="mt-1.5 block text-[13px] leading-snug text-text-2 lg:text-base">
            {scenarioNames.length} grid scenarios with the same parts, sensors and battery: {scenarioNames.join(', ')}.
          </span>
          <span className="mt-1 block text-[11px] leading-snug text-muted lg:text-[13px]">A grid simulation: top-down, tile by tile. Not the rail physics of the missions.</span>
        </span>
        <Icon name="next" size={22} className="shrink-0 text-orange" />
      </Link>

      <HowItWasBuilt built={howItWasBuilt()} />
    </Shell>
  );
}
