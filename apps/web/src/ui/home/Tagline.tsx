'use client';

import { useBuildStore } from '@/state/build';

const LINE = 'font-display text-[40px] font-bold leading-[1.02] lg:text-[68px]';

/** Home's line as one sentence, for places that quote it (the share card): the last part follows who drove. */
export const tagline = (drove: boolean): string => `Build the body. Brief the brain. ${drove ? 'Then race it.' : 'Watch it drive.'}`;

/** The three-line headline. The last line follows the mode: you race the brain in Drive mode, you watch it in Jev mode. */
export function Tagline() {
  const mode = useBuildStore((store) => store.mode);
  return (
    <h1 className="rr-rise mt-1.5 flex flex-col gap-0.5">
      <span className={LINE}>Build the body.</span>
      <span className={`${LINE} text-cyan`}>Brief the brain.</span>
      <span className={`${LINE} text-orange`}>{mode === 'drive' ? 'Then race it.' : 'Watch it drive.'}</span>
    </h1>
  );
}
