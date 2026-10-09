import { WorkshopCanvas } from '@/game';
import { Placeholder } from '@/ui/Placeholder';

export default function WorkshopPage() {
  return (
    <Placeholder title="Workshop" note="Placeholder: slot picker, presets, budget and stat bars land in the ui session.">
      <div className="h-80 overflow-hidden rounded-lg border border-slate-line">
        <WorkshopCanvas />
      </div>
    </Placeholder>
  );
}
