import { LAB_HONESTY, LAB_SIMPLIFICATIONS } from './copy';

/** What this simulation is, and each way it departs from the track, from the sim's own list. Shown on the picker and on every brief. */
export function Simplifications() {
  return (
    <div className="rounded-xl border border-dashed border-line-3 px-3 py-2 text-xs leading-snug text-text-2">
      <p data-testid="scenario-honesty">{LAB_HONESTY}</p>
      <details className="mt-1.5">
        <summary className="flex min-h-9 cursor-pointer items-center font-mono text-[11px] font-medium tracking-[1px] text-orange-soft">HOW IT DIFFERS FROM THE TRACK</summary>
        <ul className="flex list-disc flex-col gap-1 pb-1 pl-4" data-testid="scenario-simplifications">
          {LAB_SIMPLIFICATIONS.map((sentence) => <li key={sentence}>{sentence}</li>)}
        </ul>
      </details>
    </div>
  );
}
