import Link from 'next/link';
import { LAB_RIVAL_LATENCY_MS, LAB_SCENARIO_IDS, LAB_SCENARIOS } from '@rivetrun/lab';
import { Icon } from '@/ui/Icon';
import { BrainArena } from '@/ui/lab/BrainArena';
import { arenaResults } from '@/ui/lab/arenaData';
import { howItWasBuilt } from '@/ui/lab/builtData';
import { HowItWasBuilt } from '@/ui/lab/HowItWasBuilt';
import { Shell } from '@/ui/Shell';

// The arena results, the git log and the docs are read on each request, so the page follows the repository.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Lab · RivetRun' };

export default function LabPage() {
  const scenarioNames = LAB_SCENARIO_IDS.map((id) => LAB_SCENARIOS[id].name);
  return (
    <Shell back="/" title="Lab">
      <BrainArena arena={arenaResults()} ctfRivalMs={LAB_RIVAL_LATENCY_MS} />

      {/* The one way into Lab Missions for now: not on Home or in the menu until QA has seen it green. */}
      <Link href="/scenarios" data-testid="lab-missions-link" className="rr-card flex items-center gap-3 p-4 active:bg-panel-2">
        <span className="min-w-0 flex-1">
          <span className="block font-display text-2xl font-bold leading-none">Lab Missions</span>
          <span className="mt-1.5 block text-[13px] leading-snug text-text-2">
            {scenarioNames.length} grid scenarios with the same parts, sensors and battery: {scenarioNames.join(', ')}.
          </span>
          <span className="mt-1 block text-[11px] leading-snug text-muted">A grid simulation: top-down, tile by tile. Not the rail physics of the missions.</span>
        </span>
        <Icon name="next" size={22} className="shrink-0 text-orange" />
      </Link>

      <HowItWasBuilt built={howItWasBuilt()} />
    </Shell>
  );
}
