import { ScenarioPicker } from '@/lab/ScenarioPicker';
import { Shell } from '@/ui/Shell';

export const metadata = { title: 'Lab Missions · RivetRun' };

export default function ScenariosPage() {
  return (
    <Shell back="/lab" title="Lab Missions">
      <ScenarioPicker />
    </Shell>
  );
}
