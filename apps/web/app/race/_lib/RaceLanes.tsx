import type { Mission } from '@rivetrun/contracts';
import { compileTrack } from '@rivetrun/sim';
import { ACTION_LABEL, TERRAIN_LOOK } from '@/game/palette';
import { playerStatus } from './Ranking';
import { laneColor, type RacePlayer } from './protocol';
import { RobotGlyph } from './RobotGlyph';
import styles from './race.module.css';

const OBSTACLE_LABEL = { rock: 'ROCK', step: 'STEP', log: 'LOG' } as const;
/** Past this share of the track the name tag flips to the robot's left so it never leaves the lane. */
const LABEL_FLIP_PCT = 72;
const START_PAD = 'w-[3.2vw] min-w-8 shrink-0';
const FINISH_POST = 'w-[1.6vw] min-w-4 shrink-0';

interface RaceLanesProps {
  readonly mission: Mission;
  readonly players: readonly RacePlayer[];
}

function laneCaption(player: RacePlayer, trackLengthM: number): string {
  if (player.done) return playerStatus(player, trackLengthM);
  if (player.thinking) return 'JEV THINKING…';
  return player.lastAction ? ACTION_LABEL[player.lastAction].toUpperCase() : 'READY';
}

/** All robots on one track, one lane each, seen from the side. Positions come from the phones at 5 Hz. */
export function RaceLanes({ mission, players }: RaceLanesProps) {
  const world = compileTrack(mission.track);
  const percent = (m: number): number => (Math.min(world.lengthM, Math.max(0, m)) / world.lengthM) * 100;
  const width = (startM: number, endM: number): string => `${percent(endM) - percent(startM)}%`;
  const lanes = [...players].sort((a, b) => a.lane - b.lane);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Terrain key: one block per segment, to scale with the lanes below. */}
      <div className="flex h-[4.2vh] min-h-7 shrink-0 overflow-hidden rounded-t-[0.6vw] bg-slate-deep">
        <div className={`${START_PAD} flex items-center justify-center font-mono text-[clamp(0.5rem,0.7vw,0.95rem)] font-bold text-dim`}>GO</div>
        <div className="flex min-w-0 flex-1">
          {world.segments.map((segment) => (
            <div
              key={segment.index}
              className="flex items-center justify-center overflow-hidden border-r border-slate-deep/50 font-mono text-[clamp(0.55rem,0.85vw,1.1rem)] font-bold uppercase tracking-wider text-slate-deep"
              style={{ width: width(segment.startM, segment.endM), background: TERRAIN_LOOK[segment.terrain].hud }}
            >
              <span className="truncate px-1">
                {TERRAIN_LOOK[segment.terrain].label}
                {segment.slopeDeg !== 0 ? ` ${segment.slopeDeg > 0 ? '↗' : '↘'}${Math.abs(segment.slopeDeg)}°` : ''}
              </span>
            </div>
          ))}
        </div>
        <div className={`${styles.chequer} ${FINISH_POST}`} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[0.5vh] rounded-b-[0.6vw] border border-t-0 border-slate-line bg-slate-deep/70 p-[0.5vh]">
        {lanes.map((player) => {
          const color = laneColor(player.lane);
          const wrecked = player.done && !player.finished;
          const at = percent(player.x);
          const flip = at > LABEL_FLIP_PCT;
          return (
            <div key={player.id} className="relative flex min-h-0 flex-1 overflow-hidden rounded-[0.4vw] bg-slate-ink/60" style={{ maxHeight: '15vh' }}>
              <div className={`${START_PAD} ${styles.surface}`} style={{ ['--terrain' as string]: '#3a475a' }} />
              <div className="relative min-w-0 flex-1">
                {/* Lane surface: the same terrain blocks, dimmed, with a lit top edge. */}
                <div className="absolute inset-0 flex">
                  {world.segments.map((segment) => (
                    <div
                      key={segment.index}
                      className={styles.surface}
                      style={{ width: width(segment.startM, segment.endM), ['--terrain' as string]: TERRAIN_LOOK[segment.terrain].hud }}
                    />
                  ))}
                </div>
                {world.obstacles.map((obstacle) => (
                  <span
                    key={obstacle.xM}
                    className="absolute bottom-[6%] -translate-x-1/2 rounded-sm border border-safety bg-slate-deep px-[0.3vw] font-mono text-[clamp(0.45rem,0.6vw,0.8rem)] font-bold text-safety-hi"
                    style={{ left: `${percent(obstacle.xM)}%` }}
                  >
                    {OBSTACLE_LABEL[obstacle.kind]}
                  </span>
                ))}

                {/* The robot: centred on its position; CSS eases between 5 Hz updates. */}
                <div className={`${styles.runner} absolute inset-y-0 flex items-end`} style={{ left: `${at}%` }}>
                  <div className="relative flex h-full items-end">
                    <RobotGlyph
                      build={player.build}
                      color={color}
                      wrecked={wrecked}
                      className={`h-[84%] w-auto drop-shadow-[0_2px_4px_rgb(0_0_0/0.6)] ${player.thinking ? styles.thinking : ''}`}
                    />
                    <div
                      className={`absolute top-[6%] flex flex-col whitespace-nowrap ${flip ? 'right-full mr-[0.4vw] items-end' : 'left-full ml-[0.4vw] items-start'}`}
                    >
                      <span
                        className="rounded-sm px-[0.4vw] font-sans text-[clamp(0.7rem,1.1vw,1.5rem)] font-black leading-tight text-slate-deep"
                        style={{ background: wrecked ? '#566273' : color }}
                      >
                        {player.nickname}
                      </span>
                      <span className="mt-[0.2vh] rounded-sm bg-slate-deep/85 px-[0.4vw] font-mono text-[clamp(0.5rem,0.75vw,1rem)] font-bold text-slate-200">
                        {laneCaption(player, world.lengthM)} · DMG {Math.round(player.damagePct)}% · BAT {Math.round(player.batteryPct)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className={`${styles.chequer} ${FINISH_POST} opacity-80`} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
