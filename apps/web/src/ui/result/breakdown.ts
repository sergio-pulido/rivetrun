// The gameplay v3 result breakdown: where the run lost time and took damage, as the sim measured it
// (Outcome.breakdown). This only words the figures; the "try next" line is the sim's own.
import type { Outcome } from '@rivetrun/contracts';

type Breakdown = NonNullable<Outcome['breakdown']>;
type Tone = 'ok' | 'warn';

export interface BreakdownView {
  /** Null when the mission had no scan zones. */
  readonly scans: { readonly text: string; readonly detail: string | null; readonly tone: Tone } | null;
  readonly slip: { readonly text: string; readonly tone: Tone };
  /** Causes that did damage, biggest first. Empty for a clean run. */
  readonly damage: readonly { readonly cause: string; readonly pct: number }[];
  readonly tryNext: string | null;
  /** Every loss in score points, biggest first, when the sim ranks them. The first is the biggest loss of the run. Empty on a run that did not finish. */
  readonly losses: readonly { readonly label: string; readonly points: number }[];
  /** Set on a run that did not finish: the share of the track it covered. Not finishing is then the loss that matters. */
  readonly unfinishedAtPct: number | null;
}

const LOSS: Readonly<Record<string, string>> = { impact: 'Impacts', landing: 'Hard landings', fall: 'Falls', water: 'Water', slip: 'Wheelspin', scans: 'Missed scans' };

const CAUSE: Readonly<Record<keyof Breakdown['damageByCause'], string>> = { impact: 'Impacts', landing: 'Hard landings', water: 'Water', tipOver: 'Scraping on slopes', fall: 'Falls' };
/** Below this, wheelspin cost nothing a player would notice. */
const SLIP_NOTICEABLE_S = 0.05;

/**
 * `run` says whether the run finished. On a DNF the score is a share of the track covered, so the point losses the sim
 * ranks are not what the run lost: they are left out, and the view says how far the robot got instead.
 */
export function breakdownView(breakdown: Outcome['breakdown'], run: Pick<Outcome, 'finished' | 'progressFraction'> = { finished: true, progressFraction: 1 }): BreakdownView | null {
  if (!breakdown) return null;
  const zones = breakdown.scansDone + breakdown.scansMissed;
  const detail = [
    breakdown.scansMissed > 0 ? `${breakdown.scansMissed} missed: +${Math.round(breakdown.scanPenaltyS)} s` : null,
    breakdown.scanBonus > 0 ? `centred stops: +${Math.round(breakdown.scanBonus)} pts` : null,
  ].filter(Boolean);
  return {
    scans: zones === 0 ? null : { text: `${breakdown.scansDone} of ${zones} scanned`, detail: detail.length > 0 ? detail.join(' · ') : null, tone: breakdown.scansMissed > 0 ? 'warn' : 'ok' },
    slip: breakdown.slipLostS >= SLIP_NOTICEABLE_S ? { text: `${breakdown.slipLostS.toFixed(1)} s lost to wheelspin`, tone: 'warn' } : { text: 'No time lost to wheelspin', tone: 'ok' },
    damage: (Object.entries(breakdown.damageByCause) as [keyof Breakdown['damageByCause'], number][])
      .map(([cause, pct]) => ({ cause: CAUSE[cause], pct: Math.round(pct) }))
      .filter((entry) => entry.pct > 0)
      .sort((a, b) => b.pct - a.pct),
    tryNext: breakdown.tryNext.trim() || null,
    losses: run.finished ? (breakdown.losses ?? []).map((loss) => ({ label: LOSS[loss.kind] ?? loss.kind, points: Math.round(loss.points) })).filter((loss) => loss.points > 0) : [],
    unfinishedAtPct: run.finished ? null : Math.round(run.progressFraction * 100),
  };
}
