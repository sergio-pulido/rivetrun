import { laneColor, rankPlayers, resultText, type RacePlayer } from './protocol';

const JEV_COLOR = '#3fd0e0';

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
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: jev ? JEV_COLOR : laneColor(player.lane) }} />
            <span className="min-w-0 flex-1 truncate font-sans font-bold">
              {player.nickname}
              {jev ? <span className="ml-1 font-mono text-[10px] font-normal text-led">AI</span> : null}
            </span>
            <span className={`shrink-0 tabular-nums ${player.finished ? 'text-ok' : player.done ? 'text-bad' : 'text-dim'}`}>
              {resultText(player, trackLengthM)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
