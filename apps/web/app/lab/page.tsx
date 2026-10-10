import { BrainArena } from '@/ui/lab/BrainArena';
import { arenaResults } from '@/ui/lab/arenaData';
import { Shell } from '@/ui/Shell';

// The arena results file is read on each request, so it shows the moment it lands.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Lab · RivetRun' };

export default function LabPage() {
  return (
    <Shell back="/" title="Lab">
      <BrainArena arena={arenaResults()} />
    </Shell>
  );
}
