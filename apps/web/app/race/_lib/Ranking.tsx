import { penaltyNote, playerColor, rankPlayers, resultShort, type RacePlayer } from './protocol';

interface RankingProps {
  readonly players: readonly RacePlayer[];
  readonly trackLengthM: number;
  /** Highlighted row (the phone's own robot). */
  readonly meId?: string;
  /** Show at most this many rows; the highlighted row is always kept. */
  readonly limit?: number;
}

/** The room's order as the server has it: one row per robot, nickname, RACE TIME / DNF reason / progress. */
export function Ranking({ players, trackLengthM, meId, limit }: RankingProps) {
  const ranked = rankPlayers(players).map((player, index) => ({ player, place: index + 1 }));
  const shown = limit === undefined ? ranked : ranked.filter(({ player, place }) => place <= limit || player.id === meId);
  return (
    <ol className="flex flex-col gap-1">
      {shown.map(({ player, place }) => {
        const me = player.id === meId;
        const jev = player.kind === 'jev';
        return (
          <li
            key={player.id}
            className={`flex items-center gap-2 rounded-md border px-2 py-1 font-mono text-xs ${me ? 'border-safety bg-safety/15' : 'border-slate-line bg-slate-deep/80'}`}
          >
            <span className="w-4 shrink-0 text-right font-black tabular-nums">{place}</span>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: playerColor(player, meId) }} />
            <span className="min-w-0 flex-1 truncate font-sans font-bold">
              {player.nickname}
              {jev ? <span className="ml-1 font-mono text-[10px] font-normal text-led">AI</span> : null}
            </span>
            {/* The time alone, so the nickname keeps its room; a missed scan is a short tag after it. */}
            <span className={`shrink-0 whitespace-nowrap tabular-nums ${player.finished ? 'text-ok' : player.done ? 'text-bad' : 'text-dim'}`}>
              {resultShort(player, trackLengthM)}
              {penaltyNote(player) ? <span className="ml-1 text-[10px] font-normal text-warn" title={penaltyNote(player) ?? undefined}>+{Math.round(player.penaltyMs / 1000)} s scan</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
