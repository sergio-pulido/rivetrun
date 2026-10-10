import { notFound } from 'next/navigation';
import { LAB_SCENARIOS, LAB_SCENARIO_IDS, type LabScenarioId } from '@rivetrun/lab';
import { ScenarioScreen } from '@/lab/ScenarioScreen';
import { Shell } from '@/ui/Shell';

const isScenarioId = (value: string): value is LabScenarioId => (LAB_SCENARIO_IDS as readonly string[]).includes(value);

export function generateStaticParams() {
  return LAB_SCENARIO_IDS.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${isScenarioId(id) ? LAB_SCENARIOS[id].name : 'Lab Missions'} · RivetRun` };
}

export default async function ScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isScenarioId(id)) notFound();
  return (
    // A phone column on a phone held upright; on a wide screen, or a phone turned sideways, the map sits beside the controls.
    <Shell back="/scenarios" title="Lab Missions" className="landscape:max-w-[1120px] lg:max-w-[1120px]">
      <ScenarioScreen id={id} />
    </Shell>
  );
}
