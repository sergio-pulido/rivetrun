import type { SegmentVerdict } from './sim';

/** How a verdict is shown: its word, and the classes of its badge. */
export const VERDICT_LOOK: Readonly<Record<SegmentVerdict, { readonly label: string; readonly text: string; readonly badge: string; readonly frame: string }>> = {
  ok: { text: 'text-ok', label: 'OK', badge: 'border-ok/50 text-ok', frame: 'border-line' },
  slow: { text: 'text-warn', label: 'Slow', badge: 'border-warn/60 text-warn', frame: 'border-warn/40' },
  damage: { text: 'text-orange-soft', label: 'Damage', badge: 'border-orange/70 text-orange-soft', frame: 'border-orange/50' },
  fail: { text: 'text-bad', label: 'Fail', badge: 'border-bad bg-bad/15 text-bad', frame: 'border-bad' },
  not_reached: { text: 'text-faint', label: 'Not reached', badge: 'border-line-3 text-faint', frame: 'border-dashed border-line-3' },
};
