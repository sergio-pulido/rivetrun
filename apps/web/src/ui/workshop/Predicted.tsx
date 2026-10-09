import type { Build } from '@rivetrun/contracts';
import { predict } from '@/ui/predict';

/** Six live numbers for the build on the bench. They move as parts and dials change. */
export function Predicted({ build }: { readonly build: Build }) {
  const prediction = predict(build);
  return (
    <section className="flex flex-col gap-1.5" aria-label="Predicted stats">
      <div className="flex items-baseline justify-between">
        <h2 className="rr-label">Predicted</h2>
        <span className="font-mono text-[9px] font-medium tracking-[1px] text-faint">{prediction.live ? 'FROM THE SIM' : 'PARTS ONLY · DIALS NOT MODELLED YET'}</span>
      </div>
      <dl className="grid grid-cols-3 gap-1.5">
        {prediction.stats.map((stat) => (
          <div key={stat.key} className="flex flex-col gap-0.5 rounded-[10px] border border-line bg-panel-2 px-2 py-1.5">
            <dt className="font-mono text-[9px] font-medium uppercase tracking-[1px] text-muted">{stat.label}</dt>
            <dd className={`truncate font-mono text-[13px] font-semibold tabular-nums ${stat.value === null ? 'text-faint' : ''}`}>{stat.value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
