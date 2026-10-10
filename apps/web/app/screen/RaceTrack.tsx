import { BRIEFING_PRESETS, type Mission, type TerrainId } from '@rivetrun/contracts';
import { compileTrack, type World } from '@rivetrun/sim';
import { matchPreset } from '@/ui/buildStats';
import { resultText, type RacePlayer, type RaceStatus } from '../race/_lib/protocol';
import styles from './screen.module.css';

// Swap point: when `RaceCanvas` lands in @/game, render it here from the same props
// ({ mission, players }); the rest of the big screen does not change.

/** Terrain strip colours of the design board. */
const STRIP: Readonly<Record<TerrainId, string>> = {
  asphalt: '#3A3E46',
  grass: '#3E8E52',
  sand: '#B08D57',
  mud: '#7A5233',
  water: '#2E7FA0',
  ice: '#BFE3F2',
  rock: '#8C949E',
  snow: '#E9F1F5',
};
const LOCOMOTION_LABEL: Readonly<Record<string, string>> = { wheels: 'wheels', offroad_wheels: 'off-road', tracks: 'tracks' };
const LANE_MAX = 60;
const LANE_MIN = 13;
const LANE_GAP = 8;
/** Above this many robots the lanes pack tight and drop the build line. */
const DENSE_FROM = 13;
const DENSE_GAP = 2;
/** Height the lanes may use on the 720-high board, below the header and captions. */
const LANES_HEIGHT = 500;
/** Past this share of the track the action chip moves to the robot's left. */
const CHIP_FLIP = 0.68;

const laneGap = (count: number): number => (count >= DENSE_FROM ? DENSE_GAP : LANE_GAP);
const laneHeight = (count: number, budget: number): number =>
  Math.max(LANE_MIN, Math.min(LANE_MAX, Math.floor((budget - laneGap(count) * (count - 1)) / Math.max(1, count))));

function stripGradient(world: World): string {
  const stops = world.segments.map(
    (segment) => `${STRIP[segment.terrain]} ${(segment.startM / world.lengthM) * 100}% ${(segment.endM / world.lengthM) * 100}%`,
  );
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

const JEV_COLOR = '#3FD0E0';
const HUMAN_COLOR = '#FF7A1A';
const OUT_COLOR = '#5B6470';

/** Humans: "tracks · Mud Crawler". Jev bots: "JEV · Daredevil". */
function buildLine(player: RacePlayer): string {
  if (player.kind === 'jev') {
    const preset = BRIEFING_PRESETS.find((candidate) => candidate.text === player.briefing);
    return `AI · ${preset ? preset.name : player.briefing ? 'custom brief' : 'no brief'}`;
  }
  const locomotion = LOCOMOTION_LABEL[player.build.locomotion] ?? player.build.locomotion;
  return `${locomotion} · ${matchPreset(player.build)?.name ?? 'custom'}`;
}

/** The chip next to the robot. Results use the same words as every other screen (resultText). */
function chip(player: RacePlayer, status: RaceStatus, trackLengthM: number): { text: string; tone: string } {
  if (player.done) {
    const text = resultText(player, trackLengthM);
    return player.finished ? { text: `FINISH · ${text}`, tone: styles.actionDone! } : { text, tone: styles.actionOut! };
  }
  if (status === 'build') return player.ready ? { text: 'ready ✓', tone: styles.actionDone! } : { text: 'building…', tone: '' };
  if (status === 'lobby' || status === 'countdown') return { text: 'on the grid', tone: '' };
  if (player.silent) return { text: 'signal lost', tone: styles.actionOut! };
  if (player.thinking) return { text: 'jev thinking…', tone: styles.actionThinking! };
  if (player.lastAction) {
    const pct = player.lastActionP === null ? '' : ` ${Math.round(player.lastActionP * 100)}%`;
    return { text: `${player.lastAction}${pct}`, tone: '' };
  }
  return { text: 'starting…', tone: '' };
}

function Robot({ color, tracks }: { readonly color: string; readonly tracks: boolean }) {
  return (
    <svg className={styles.robot} viewBox="0 0 240 150" aria-hidden="true">
      <rect x="52" y="44" width="110" height="16" rx="2" fill="#2E9D63" />
      <rect x="34" y="60" width="170" height="36" rx="8" fill={color} />
      <rect x="194" y="54" width="32" height="42" rx="7" fill="#121418" />
      <rect x="201" y="67" width="7" height="13" rx="2" fill="#3FD0E0" />
      <rect x="213" y="67" width="7" height="13" rx="2" fill="#3FD0E0" />
      {tracks ? (
        <g>
          <rect x="38" y="90" width="166" height="50" rx="25" fill="#17191D" stroke="#2C3038" strokeWidth="7" />
          <circle cx="68" cy="115" r="9" fill="#2C3038" />
          <circle cx="121" cy="115" r="9" fill="#2C3038" />
          <circle cx="174" cy="115" r="9" fill="#2C3038" />
        </g>
      ) : (
        <g>
          <circle cx="72" cy="114" r="27" fill="#17191D" stroke="#2C3038" strokeWidth="7" />
          <circle cx="168" cy="114" r="27" fill="#17191D" stroke="#2C3038" strokeWidth="7" />
        </g>
      )}
    </svg>
  );
}

interface RaceTrackProps {
  readonly mission: Mission;
  readonly players: readonly RacePlayer[];
  readonly status: RaceStatus;
  /** Height the lanes may use, in design px. Smaller when something else shares the column (decision chips). */
  readonly heightBudget?: number;
}

/** One lane per pilot: name and build on the left, the robot with its last-action chip on the terrain strip. Humans orange, Jev bots cyan. */
export function RaceTrack({ mission, players, status, heightBudget = LANES_HEIGHT }: RaceTrackProps) {
  const world = compileTrack(mission.track);
  const terrains = [...new Set(world.segments.map((segment) => segment.terrain))].join(' · ');
  const lanes = [...players].sort((a, b) => a.lane - b.lane);
  const height = laneHeight(lanes.length, heightBudget);
  const gradient = stripGradient(world);
  const dense = lanes.length >= DENSE_FROM;

  return (
    <>
      <div className={styles.captions}>
        <span>Pilot</span>
        <div className={styles.captionTrack}>
          <span>Start</span>
          <span>{terrains}</span>
          <span>Finish</span>
        </div>
      </div>
      <div className={`${styles.lanes} ${dense ? styles.lanesDense : ''}`} style={{ ['--gap' as string]: laneGap(lanes.length) }}>
        {lanes.length === 0 ? <div className={styles.emptyLane}>The grid is empty. Scan the code to bring your robot.</div> : null}
        {lanes.map((player) => {
          const out = player.done && !player.finished;
          const at = Math.min(1, Math.max(0, player.x / world.lengthM));
          const { text, tone } = chip(player, status, world.lengthM);
          return (
            <div key={player.id} className={`${styles.lane} ${out ? styles.laneOut : ''}`} style={{ ['--h' as string]: height }}>
              <div className={styles.pilot}>
                <span className={styles.nick} style={player.kind === 'jev' ? { color: JEV_COLOR } : undefined}>
                  {player.nickname}
                </span>
                {dense ? null : <span className={styles.build}>{buildLine(player)}</span>}
              </div>
              <div className={styles.road}>
                <div className={styles.terrain} style={{ background: gradient }} />
                <div className={styles.finish} />
                <div className={styles.runner} style={{ ['--at' as string]: at }}>
                  <Robot color={out ? OUT_COLOR : player.kind === 'jev' ? JEV_COLOR : HUMAN_COLOR} tracks={player.build.locomotion === 'tracks'} />
                  <span className={`${styles.action} ${tone} ${at > CHIP_FLIP ? styles.actionLeft : ''}`}>{text}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
