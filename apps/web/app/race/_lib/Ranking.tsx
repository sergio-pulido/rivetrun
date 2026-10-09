import { DNF_LABEL } from '@/game/palette';
import { laneColor, rankPlayers, type RacePlayer } from './protocol';

export const formatRaceTime = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** What a player has achieved so far: finish time, DNF reason or % of the track. */
export function playerStatus(player: RacePlayer, trackLengthM: number): string {
  if (player.finished && player.raceMs !== null) return formatRaceTime(player.raceMs);
  if (player.done) return `DNF · ${player.dnfReason ? DNF_LABEL[player.dnfReason] : 'out'}`;
  return `${Math.round(Math.min(1, Math.max(0, player.x / trackLengthM)) * 100)} %`;
}

interface RankingProps {
  readonly players: readonly RacePlayer[];
  readonly trackLengthM: number;
  /** Highlighted row (the phone's own robot). */
  readonly meId?: string;
  /** Show at most this many rows; the highlighted row is always kept. */
  readonly limit?: number;
  readonly size?: 'phone' | 'screen';
}

/** Live order: one row per robot, lane colour, nickname, progress or result. */
export function Ranking({ players, trackLengthM, meId, limit, size = 'phone' }: RankingProps) {
  const ranked = rankPlayers(players).map((player, index) => ({ player, place: index + 1 }));
  const shown = limit === undefined ? ranked : ranked.filter(({ player, place }) => place <= limit || player.id === meId);
  const big = size === 'screen';
  return (
    <ol className={`flex flex-col ${big ? 'gap-[0.7vh]' : 'gap-1'}`}>
      {shown.map(({ player, place }) => {
        const me = player.id === meId;
        return (
          <li
            key={player.id}
            className={`flex items-center rounded-md border font-mono ${
              big ? 'gap-[0.8vw] px-[0.8vw] py-[0.6vh] text-[clamp(0.9rem,1.35vw,1.8rem)]' : 'gap-2 px-2 py-1 text-xs'
            } ${me ? 'border-safety bg-safety/15' : 'border-slate-line bg-slate-deep/80'}`}
          >
            <span className={`shrink-0 text-right font-black tabular-nums ${big ? 'w-[1.6vw]' : 'w-4'}`}>{place}</span>
            <span className={`shrink-0 rounded-full ${big ? 'h-[1vw] w-[1vw]' : 'h-2.5 w-2.5'}`} style={{ background: laneColor(player.lane) }} />
            <span className="min-w-0 flex-1 truncate font-sans font-bold">{player.nickname}</span>
            <span className={`shrink-0 tabular-nums ${player.finished ? 'text-ok' : player.done ? 'text-bad' : 'text-dim'}`}>
              {playerStatus(player, trackLengthM)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
