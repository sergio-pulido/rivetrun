import type { PersonalBest, RecordOutcome } from '@/state/personalBests';
import { formatSeconds } from '@/ui/format';

const runsText = (runs: number): string => `${runs} ${runs === 1 ? 'run' : 'runs'}`;

/** A personal best in one line: "43.6 s · 720 pts · 3 runs". */
export function bestLine(best: PersonalBest): string {
  if (best.timeS === null || best.score === null) return `No finish yet · ${runsText(best.runs)}`;
  return `${formatSeconds(best.timeS)} s · ${Math.round(best.score)} pts · ${runsText(best.runs)}`;
}

export interface BestVerdict {
  /** True when this run is the new best. */
  readonly fresh: boolean;
  readonly text: string;
}

/** Seconds between two times as the screen shows them, so the margin always matches the two figures. */
const gap = (a: number, b: number): number => Math.round((Number(formatSeconds(a)) - Number(formatSeconds(b))) * 10) / 10;

/** What a finished run means against the player's best with this robot. Null when there is nothing to compare or celebrate. */
export function newBestLine(outcome: { readonly finished: boolean; readonly timeS: number; readonly score: number }, recorded: RecordOutcome): BestVerdict | null {
  if (recorded.repeat) return null;
  const { previous } = recorded;
  if (recorded.improved) {
    if (!previous || previous.timeS === null || previous.score === null) return { fresh: true, text: 'First finish with this robot: your time to beat.' };
    const faster = gap(previous.timeS, outcome.timeS);
    const points = Math.round(outcome.score - previous.score);
    const more = points > 0 ? `${points} pts more than` : 'Level on points with';
    if (faster > 0) return { fresh: true, text: `${faster.toFixed(1)} s faster and ${more.charAt(0).toLowerCase()}${more.slice(1)} your best with this robot.` };
    return { fresh: true, text: `${more} your best with this robot${faster < 0 ? ` (${(-faster).toFixed(1)} s slower)` : ''}.` };
  }
  if (!previous || previous.timeS === null || previous.score === null) return null;
  const mine = `Your best with this robot: ${formatSeconds(previous.timeS)} s · ${Math.round(previous.score)} pts.`;
  if (!outcome.finished) return { fresh: false, text: mine };
  const slower = gap(outcome.timeS, previous.timeS);
  return { fresh: false, text: `${mine} This run: ${slower > 0 ? `${slower.toFixed(1)} s slower` : slower < 0 ? `${(-slower).toFixed(1)} s faster, but fewer points` : 'the same time, fewer points'}.` };
}
