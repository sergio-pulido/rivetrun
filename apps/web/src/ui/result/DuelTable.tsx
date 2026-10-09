import type { Episode, Outcome, Policy } from '@rivetrun/contracts';
import { POLICY_LABEL, POLICY_TINT } from '@/game/palette';
import type { GhostResult } from '@/state/run';
import { Icon } from '@/ui/Icon';

interface Row {
  readonly policy: Policy;
  readonly outcome: Outcome;
  readonly player: boolean;
}

const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_24px_44px_34px_34px_40px] items-center gap-x-1';

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!;
};

/** One sentence on who won, from the three measured scores. */
function verdict(rows: readonly Row[]): string {
  const ranked = [...rows].sort((a, b) => b.outcome.score - a.outcome.score);
  const [first, second] = ranked;
  const player = rows.find((row) => row.player);
  if (!first || !second || !player) return '';
  const margin = first.outcome.score - second.outcome.score;
  const name = (row: Row): string => POLICY_LABEL[row.policy];
  if (margin === 0) return `${name(first)} and ${name(second)} tied on ${first.outcome.score} points.`;
  if (first.player) return `${name(first)} won this run, ${margin} points clear of ${name(second)}.`;
  return `${name(first)} beat ${name(player)} by ${first.outcome.score - player.outcome.score} points on this run.`;
}

interface DuelTableProps {
  readonly episode: Episode;
  readonly ghosts: readonly GhostResult[];
}

/** Brain Duel: the player's run against the heuristic and random ghosts, same mission, seed and build. */
export function DuelTable({ episode, ghosts }: DuelTableProps) {
  const rows: readonly Row[] = [
    { policy: episode.policy, outcome: episode.outcome, player: true },
    ...ghosts.map((ghost) => ({ policy: ghost.policy, outcome: ghost.outcome, player: false })),
  ];
  const best = Math.max(...rows.map((row) => row.outcome.score));
  const fallbacks = episode.decisions.filter((decision) => decision.fallback).length;
  const latency = median(episode.decisions.filter((decision) => !decision.fallback).map((decision) => decision.latencyMs));

  return (
    <section className="rr-panel p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="rr-label">Brain duel</h2>
        <span className="font-mono text-[10px] text-dim">same track · seed · robot</span>
      </div>

      <div className={`${COLUMNS} mt-3 px-2 font-mono text-[9px] uppercase tracking-wider text-dim`}>
        <span>Brain</span>
        <span className="text-center">Fin</span>
        <span className="text-right">Time</span>
        <span className="text-right">Dmg</span>
        <span className="text-right">Enrg</span>
        <span className="text-right">Score</span>
      </div>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {rows.map((row) => {
          const winner = row.outcome.score === best;
          return (
            <li
              key={row.policy}
              className={`${COLUMNS} rounded-xl border px-2 py-2.5 font-mono text-xs tabular-nums ${
                winner ? 'border-safety/70 bg-safety/10' : 'border-slate-line bg-slate-deep/60'
              }`}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: POLICY_TINT[row.policy] }} />
                <span className="font-sans text-xs font-bold">{POLICY_LABEL[row.policy]}</span>
                {row.player ? <span className="shrink-0 rounded bg-slate-line px-1 py-0.5 text-[8px] font-bold leading-none text-slate-200">YOU</span> : null}
              </span>
              <span className={`grid place-items-center ${row.outcome.finished ? 'text-ok' : 'text-bad'}`}>
                {row.outcome.finished ? <Icon name="check" size={15} /> : <span className="text-[10px] font-bold">DNF</span>}
              </span>
              <span className="text-right">{row.outcome.timeS.toFixed(1)}s</span>
              <span className="text-right">{Math.round(row.outcome.damagePct)}%</span>
              <span className="text-right">{Math.round(row.outcome.energyUsedPct)}%</span>
              <span className={`text-right text-sm font-bold ${winner ? 'text-safety' : ''}`}>{row.outcome.score}</span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[13px] leading-snug text-slate-200">{verdict(rows)}</p>
      <p className="mt-1 font-mono text-[10px] leading-relaxed text-dim">
        {episode.decisions.length} decisions
        {episode.decisions.length > fallbacks ? ` · median ${Math.round(latency)} ms` : ''}
        {fallbacks > 0 ? (
          <span className="text-warn">
            {' '}
            · {fallbacks} by heuristic fallback
          </span>
        ) : null}
      </p>
    </section>
  );
}
