import type { Mission, Segment } from '@rivetrun/contracts';
import { compileTrack } from '@rivetrun/sim';
import { TERRAIN_LOOK } from '@/game/palette';

const WIDTH = 358;
const HEIGHT = 112;
const GROUND = 26;
const HEADROOM = 30;
/** Slopes are drawn steeper than life so a 4° ramp still reads on a phone. */
const MAX_PX_PER_M = 14;

const OBSTACLE_LABEL = { rock: 'ROCK', step: 'STEP', log: 'LOG' } as const;

const rise = (segment: Segment): number => segment.lengthM * Math.tan((segment.slopeDeg * Math.PI) / 180);

const slopeText = (slopeDeg: number): string => (slopeDeg === 0 ? 'flat' : `${slopeDeg > 0 ? '↗' : '↘'} ${Math.abs(slopeDeg)}°`);

interface TrackProfileProps {
  readonly mission: Mission;
  /** Hide the per-segment cards (Home uses the bare strip). */
  readonly compact?: boolean;
}

/** Side-on elevation profile of a mission: one coloured block per terrain segment, obstacles flagged. */
export function TrackProfile({ mission, compact = false }: TrackProfileProps) {
  const world = compileTrack(mission.track);
  const segments = mission.track.segments;
  const heights = segments.reduce<number[]>((acc, segment) => [...acc, acc[acc.length - 1]! + rise(segment)], [0]);
  const low = Math.min(...heights);
  const span = Math.max(...heights) - low;
  const pxPerM = span === 0 ? 0 : Math.min((HEIGHT - GROUND - HEADROOM) / span, MAX_PX_PER_M);
  const x = (m: number): number => (m / world.lengthM) * WIDTH;
  const y = (h: number): number => HEIGHT - GROUND - (h - low) * pxPerM;
  const heightAt = (m: number): number => {
    const segment = world.segments.find((s) => m <= s.endM) ?? world.segments[world.segments.length - 1]!;
    const t = (m - segment.startM) / (segment.endM - segment.startM);
    return heights[segment.index]! + (heights[segment.index + 1]! - heights[segment.index]!) * t;
  };

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block w-full" role="img" aria-label={`${mission.name} track profile`}>
        <defs>
          <linearGradient id="rr-depth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {world.segments.map((segment) => {
          const look = TERRAIN_LOOK[segment.terrain];
          const [x0, x1] = [x(segment.startM), x(segment.endM)];
          const [y0, y1] = [y(heights[segment.index]!), y(heights[segment.index + 1]!)];
          const shape = `${x0},${y0} ${x1},${y1} ${x1},${HEIGHT} ${x0},${HEIGHT}`;
          return (
            <g key={segment.index}>
              <polygon points={shape} fill={look.hud} />
              <polygon points={shape} fill="url(#rr-depth)" />
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
              {segment.index > 0 ? <line x1={x0} y1={y0} x2={x0} y2={HEIGHT} stroke="#0a0e13" strokeOpacity="0.5" /> : null}
              <text x={(x0 + x1) / 2} y={HEIGHT - 8} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="#0a0e13" fillOpacity="0.8" fontWeight="700">
                {segment.endM - segment.startM}
              </text>
            </g>
          );
        })}
        {world.obstacles.map((obstacle) => {
          const [ox, oy] = [x(obstacle.xM), y(heightAt(obstacle.xM))];
          return (
            <g key={obstacle.xM}>
              <path d={`M${ox - 7},${oy} L${ox - 4},${oy - 9} L${ox + 5},${oy - 9} L${ox + 7},${oy} Z`} fill="#0a0e13" stroke="#ff6a13" strokeWidth="1.5" />
              <text x={ox} y={oy - 14} textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill="#ff9a4d" fontWeight="700">
                {OBSTACLE_LABEL[obstacle.kind]}
              </text>
            </g>
          );
        })}
        {/* Start marker and chequered finish post. */}
        <circle cx="5" cy={y(heights[0]!) - 6} r="4" fill="#ff6a13" stroke="#0a0e13" strokeWidth="1.5" />
        <g transform={`translate(${WIDTH - 9}, ${y(heights[heights.length - 1]!) - 24})`}>
          <rect width="1.6" height="24" fill="#e6ebf2" />
          <rect x="-9" width="9" height="8" fill="#e6ebf2" />
          <rect x="-9" width="4.5" height="4" fill="#0a0e13" />
          <rect x="-4.5" y="4" width="4.5" height="4" fill="#0a0e13" />
        </g>
      </svg>
      {compact ? null : (
        <ol className="rr-scroll-x -mx-3 mt-3 flex gap-2 px-3 pb-1">
          {segments.map((segment, index) => (
            <li key={index} className="w-[84px] shrink-0 snap-start overflow-hidden rounded-lg border border-slate-line bg-slate-deep/70">
              <div className="h-1.5" style={{ background: TERRAIN_LOOK[segment.terrain].hud }} />
              <div className="px-2 py-1.5">
                <div className="truncate text-xs font-semibold">{TERRAIN_LOOK[segment.terrain].label}</div>
                <div className="mt-0.5 font-mono text-[10px] text-dim">
                  {segment.lengthM} m · {slopeText(segment.slopeDeg)}
                </div>
                <div className="mt-0.5 h-3 font-mono text-[10px] text-safety-hi">
                  {segment.obstacle ? OBSTACLE_LABEL[segment.obstacle] : segment.depthCm ? `${segment.depthCm} cm deep` : ''}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
