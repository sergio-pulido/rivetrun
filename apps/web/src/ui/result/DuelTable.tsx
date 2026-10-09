import type { Episode, Outcome, Policy } from '@rivetrun/contracts';
import { POLICY_LABEL } from '@/game/palette';
import type { GhostResult } from '@/state/run';
import { briefingName } from '@/ui/brief/BriefTheBrain';
import { formatSeconds } from '@/ui/format';

interface Row {
  readonly policy: Policy;
  readonly outcome: Outcome;
  readonly player: boolean;
  /** For a Jev ghost: how many of its decisions the heuristic made instead. Null when the run store does not say. */
  readonly fallbackNote: string | null;
}

/** The run store's ghost entries may carry fallback counts (optional, added by the sim session for Drive mode). */
type CountedGhost = GhostResult & { readonly fallbacks?: number; readonly decisions?: number };

function fallbackNote(ghost: CountedGhost): string | null {
  const { fallbacks, decisions } = ghost;
  if (fallbacks === undefined || fallbacks === 0) return null;
  if (decisions !== undefined && fallbacks >= decisions) return 'Jev never answered: heuristic drove';
  return decisions === undefined ? `${fallbacks} by heuristic fallback` : `${fallbacks} of ${decisions} by heuristic fallback`;
}

const COLUMNS = 'grid grid-cols-[1.6fr_1fr_1fr_1fr] items-center gap-1.5';

const RIVAL_NOTE: Readonly<Record<Policy, string>> = { jev: 'the AI model', heuristic: 'fixed rules', random: 'coin flips', human: 'your thumbs' };

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!;
};

/** Jev mode: one sentence on who won, from the three measured scores. */
function scoreVerdict(rows: readonly Row[]): string {
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

/** Drive mode: you against the AI on the clock, same robot and seed. Exported for tests. */
export function driveVerdict(you: Outcome, rival: Outcome, rivalPolicy: Policy): string {
  const ai = rivalPolicy === 'jev';
  const name = ai ? 'Jev' : POLICY_LABEL[rivalPolicy];
  const beaten = ai ? 'the AI' : name;
  if (you.finished && rival.finished) {
    // Compared as shown, so the margin always matches the two times on screen.
    const margin = Number(formatSeconds(rival.timeS)) - Number(formatSeconds(you.timeS));
    if (margin > 0) return `You beat ${beaten} by ${margin.toFixed(1)} s`;
    if (margin < 0) return `${name} wins by ${(-margin).toFixed(1)} s`;
    return `A dead heat with ${name}`;
  }
  if (you.finished) return `You finished. ${name} did not`;
  if (rival.finished) return `${name} finished. You did not`;
  const [mine, theirs] = [Math.round(you.progressFraction * 100), Math.round(rival.progressFraction * 100)];
  if (mine === theirs) return `Neither finished: both stopped at ${mine} % of the track`;
  return mine > theirs ? `Neither finished, but you got further: ${mine} % to ${theirs} %` : `Neither finished, and ${name} got further: ${theirs} % to ${mine} %`;
}

interface DuelTableProps {
  readonly episode: Episode;
  readonly ghosts: readonly GhostResult[];
  /** The briefing Jev drove with ('' = none): the player's brain in Jev mode, the rival ghost in Drive mode. */
  readonly briefing: string;
}

/** Jev mode: Brain Duel against the heuristic and random ghosts. Drive mode: You vs Jev. Same mission, seed and robot. */
export function DuelTable({ episode, ghosts, briefing }: DuelTableProps) {
  const drove = episode.policy === 'human';
  const rows: readonly Row[] = [
    { policy: episode.policy, outcome: episode.outcome, player: true, fallbackNote: null },
    ...ghosts.map((ghost) => ({ policy: ghost.policy, outcome: ghost.outcome, player: false, fallbackNote: fallbackNote(ghost) })),
  ];
  const rival = rows.find((row) => !row.player && row.policy === 'jev') ?? rows.find((row) => !row.player);
  const fallbacks = episode.decisions.filter((decision) => decision.fallback).length;
  const latency = median(episode.decisions.filter((decision) => !decision.fallback).map((decision) => decision.latencyMs));
  const brief = briefingName(briefing);

  return (
    <section className="rr-card-brain flex flex-col gap-2 !rounded-2xl p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-base font-bold tracking-[2px] text-cyan">{drove ? 'YOU VS JEV' : 'BRAIN DUEL'}</h2>
        <span className="text-[11px] text-cyan-muted">same robot · same seed</span>
      </div>

      {drove && rival ? (
        <p className="rounded-[10px] border border-[#1F3A3F] bg-[#081214] px-2.5 py-2.5 text-center font-display text-lg font-bold leading-tight text-text">
          {driveVerdict(episode.outcome, rival.outcome, rival.policy)}
        </p>
      ) : null}

      {/* In Drive mode the briefing in the store is what the Jev ghost drove with. */}
      <div className="rounded-[10px] border border-[#1F3A3F] bg-[#081214] px-2.5 py-2">
        <div className="rr-label !text-cyan-muted">
          {drove ? "Jev's briefing" : 'Your briefing'}
          {brief && !brief.startsWith('“') ? ` · ${brief}` : ''}
        </div>
        <p className="mt-1 text-[13px] leading-snug text-text">
          {briefing.trim() ? `“${briefing.trim()}”` : <span className="text-cyan-muted">None. Jev followed the priority slider.</span>}
        </p>
      </div>

      <div className={`${COLUMNS} px-2 font-mono text-[10px] font-medium tracking-[1px] text-cyan-muted`}>
        <span>{drove ? 'DRIVER' : 'BRAIN'}</span>
        <span className="text-right">TIME</span>
        <span className="text-right">DMG</span>
        <span className="text-right">SCORE</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.policy}
          className={`${COLUMNS} min-h-10 rounded-[10px] border px-2 py-1 font-mono text-[13px] tabular-nums ${
            row.player ? (drove ? 'border-orange bg-orange/10 text-text' : 'border-cyan bg-cyan/15 text-text') : `border-[#1F3A3F] ${row.outcome.finished ? 'text-text-2' : 'text-[#8A929C]'}`
          }`}
        >
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold">
              {POLICY_LABEL[row.policy]}
              {row.player && !drove ? ' · YOU' : ''}
            </span>
            <span className="truncate text-[9px] text-cyan-muted">
              {row.player && !drove ? `brief: ${brief ?? 'none'}` : (row.fallbackNote ?? RIVAL_NOTE[row.policy])}
            </span>
          </span>
          <span className="text-right">{row.outcome.finished ? `${formatSeconds(row.outcome.timeS)}s` : 'DNF'}</span>
          <span className="text-right">{Math.round(row.outcome.damagePct)}%</span>
          <span className="text-right font-semibold">{row.outcome.score}</span>
        </div>
      ))}

      {drove ? null : (
        <>
          <p className="text-[13px] leading-snug text-text">{scoreVerdict(rows)}</p>
          <p className="font-mono text-[10px] leading-relaxed text-cyan-muted">
            {episode.decisions.length} decisions
            {episode.decisions.length > fallbacks ? ` · median ${Math.round(latency)} ms` : ''}
            {fallbacks > 0 ? <span className="text-warn"> · {fallbacks} by heuristic fallback</span> : null}
          </p>
        </>
      )}
    </section>
  );
}
