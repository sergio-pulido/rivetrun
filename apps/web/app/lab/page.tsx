import { BrainArena } from '@/ui/lab/BrainArena';
import { arenaResults } from '@/ui/lab/arenaData';
import { howItWasBuilt } from '@/ui/lab/builtData';
import { HowItWasBuilt } from '@/ui/lab/HowItWasBuilt';
import { Shell } from '@/ui/Shell';

// The arena results, the git log and the docs are read on each request, so the page follows the repository.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Lab · RivetRun' };

export default function LabPage() {
  return (
    <Shell back="/" title="Lab">
      <BrainArena arena={arenaResults()} />
      <HowItWasBuilt built={howItWasBuilt()} />
    </Shell>
  );
}
