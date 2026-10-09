import type { Episode, Outcome, Policy } from '@rivetrun/contracts';
import { POLICY_LABEL } from '@/game/palette';
import type { GhostResult } from '@/state/run';
import { briefingName } from '@/ui/brief/BriefTheBrain';
import { formatSeconds } from '@/ui/format';

interface Row {
  readonly policy: Policy;
  readonly outcome: Outcome;
  readonly player: boolean;
}

const COLUMNS = 'grid grid-cols-[1.6fr_1fr_1fr_1fr] items-center gap-1.5';

const GHOST_NOTE: Readonly<Record<Policy, string>> = { jev: 'the AI model', heuristic: 'fixed rules', random: 'coin flips' };

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
  /** The briefing the player's brain drove with ('' = none). */
  readonly briefing: string;
}

/** Brain Duel: the player's run against the heuristic and random ghosts, same mission, seed and robot. */
export function DuelTable({ episode, ghosts, briefing }: DuelTableProps) {
  const rows: readonly Row[] = [
    { policy: episode.policy, outcome: episode.outcome, player: true },
    ...ghosts.map((ghost) => ({ policy: ghost.policy, outcome: ghost.outcome, player: false })),
  ];
  const fallbacks = episode.decisions.filter((decision) => decision.fallback).length;
  const latency = median(episode.decisions.filter((decision) => !decision.fallback).map((decision) => decision.latencyMs));
  const brief = briefingName(briefing);

  return (
    <section className="rr-card-brain flex flex-col gap-2 !rounded-2xl p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-base font-bold tracking-[2px] text-cyan">BRAIN DUEL</h2>
        <span className="text-[11px] text-cyan-muted">same robot · same seed</span>
      </div>

      <div className="rounded-[10px] border border-[#1F3A3F] bg-[#081214] px-2.5 py-2">
        <div className="rr-label !text-cyan-muted">Your briefing{brief && !brief.startsWith('“') ? ` · ${brief}` : ''}</div>
        <p className="mt-1 text-[13px] leading-snug text-text">
          {briefing.trim() ? `“${briefing.trim()}”` : <span className="text-cyan-muted">None. Jev followed the priority slider.</span>}
        </p>
      </div>

      <div className={`${COLUMNS} px-2 font-mono text-[10px] font-medium tracking-[1px] text-cyan-muted`}>
        <span>BRAIN</span>
        <span className="text-right">TIME</span>
        <span className="text-right">DMG</span>
        <span className="text-right">SCORE</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.policy}
          className={`${COLUMNS} min-h-10 rounded-[10px] border px-2 py-1 font-mono text-[13px] tabular-nums ${
            row.player ? 'border-cyan bg-cyan/15 text-text' : `border-[#1F3A3F] ${row.outcome.finished ? 'text-text-2' : 'text-[#8A929C]'}`
          }`}
        >
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold">
              {POLICY_LABEL[row.policy]}
              {row.player ? ' · YOU' : ''}
            </span>
            <span className="truncate text-[9px] text-cyan-muted">{row.player ? `brief: ${brief ?? 'none'}` : GHOST_NOTE[row.policy]}</span>
          </span>
          <span className="text-right">{row.outcome.finished ? `${formatSeconds(row.outcome.timeS)}s` : 'DNF'}</span>
          <span className="text-right">{Math.round(row.outcome.damagePct)}%</span>
          <span className="text-right font-semibold">{row.outcome.score}</span>
        </div>
      ))}

      <p className="text-[13px] leading-snug text-text">{verdict(rows)}</p>
      <p className="font-mono text-[10px] leading-relaxed text-cyan-muted">
        {episode.decisions.length} decisions
        {episode.decisions.length > fallbacks ? ` · median ${Math.round(latency)} ms` : ''}
        {fallbacks > 0 ? <span className="text-warn"> · {fallbacks} by heuristic fallback</span> : null}
      </p>
    </section>
  );
}
