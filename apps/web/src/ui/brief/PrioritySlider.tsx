'use client';

import { useBuildStore } from '@/state/build';

const describe = (priority: number): { label: string; note: string } => {
  if (priority < 0.35) return { label: 'Speed first', note: 'The AI accepts damage and battery drain to save seconds.' };
  if (priority > 0.65) return { label: 'Safety first', note: 'The AI gives up time to protect the robot.' };
  return { label: 'Balanced', note: 'The AI weighs time against damage evenly.' };
};

/** The one instruction the player gives the AI: 0 = speed, 1 = safety. */
export function PrioritySlider() {
  const priority = useBuildStore((store) => store.priority);
  const setPriority = useBuildStore((store) => store.setPriority);
  const { label, note } = describe(priority);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="rr-label">Orders for the AI</h2>
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={priority}
        onChange={(event) => setPriority(Number(event.target.value))}
        aria-label="Priority: speed to safety"
        aria-valuetext={label}
        className="rr-range mt-1"
      />
      <div className="flex justify-between font-mono text-[10px] font-bold uppercase tracking-widest">
        <span className="text-safety">Speed</span>
        <span className="text-led">Safety</span>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-dim">{note}</p>
    </div>
  );
}
