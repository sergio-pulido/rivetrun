'use client';

import { useBuildStore } from '@/state/build';

/** The priority the brain weighs every decision with: 0 = speed, 1 = safety. */
export function PrioritySlider() {
  const priority = useBuildStore((store) => store.priority);
  const setPriority = useBuildStore((store) => store.setPriority);
  const percent = Math.round(priority * 100);
  const valueText = percent < 35 ? 'Speed first' : percent > 65 ? 'Safety first' : 'Balanced';
  return (
    <section className="flex flex-col gap-1">
      <div className="flex justify-between font-mono text-[11px] font-medium tracking-[1px]">
        <span className="text-orange-soft">SPEED</span>
        <label htmlFor="priority" className="text-muted">
          PRIORITY · {valueText.toUpperCase()}
        </label>
        <span className="text-cyan">SAFETY</span>
      </div>
      <input
        id="priority"
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        onChange={(event) => setPriority(Number(event.target.value) / 100)}
        aria-valuetext={valueText}
        className="rr-range"
        style={{ ['--fill' as string]: `${percent}%` }}
      />
    </section>
  );
}
