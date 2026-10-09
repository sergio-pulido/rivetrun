import type { Mission, Segment } from '@rivetrun/contracts';
import { compileTrack } from '@rivetrun/sim';
import { TERRAIN_LOOK } from '@/game/palette';

const WIDTH = 334;
const HEIGHT = 104;
const LABEL_BAND = 26;
const HEADROOM = 34;
/** Slopes are drawn steeper than life so a 4° ramp still reads on a phone. */
const MAX_PX_PER_M = 12;
/** Mono 9 px: about 5.6 px per character. */
const CHAR_PX = 5.6;

const rise = (segment: Segment): number => segment.lengthM * Math.tan((segment.slopeDeg * Math.PI) / 180);

/** Side-on elevation profile: dark ground, one coloured stroke per terrain, obstacles as spikes. */
export function TrackProfile({ mission }: { readonly mission: Mission }) {
  const world = compileTrack(mission.track);
  const segments = mission.track.segments;
  const heights = segments.reduce<number[]>((acc, segment) => [...acc, acc[acc.length - 1]! + rise(segment)], [0]);
  const low = Math.min(...heights);
  const span = Math.max(...heights) - low;
  const pxPerM = span === 0 ? 0 : Math.min((HEIGHT - LABEL_BAND - HEADROOM) / span, MAX_PX_PER_M);
  const x = (m: number): number => 4 + (m / world.lengthM) * (WIDTH - 8);
  const y = (h: number): number => HEIGHT - LABEL_BAND - (h - low) * pxPerM;
  const heightAt = (m: number): number => {
    const segment = world.segments.find((s) => m <= s.endM) ?? world.segments[world.segments.length - 1]!;
    const t = (m - segment.startM) / (segment.endM - segment.startM);
    return heights[segment.index]! + (heights[segment.index + 1]! - heights[segment.index]!) * t;
  };
  const surface = heights.map((h, index) => `${x(index === 0 ? 0 : world.segments[index - 1]!.endM)},${y(h)}`).join(' ');
  const finishX = x(world.lengthM) - 2;
  const finishY = y(heights[heights.length - 1]!);
  const description = segments.map((segment) => `${TERRAIN_LOOK[segment.terrain].label}${segment.slopeDeg ? ` ${segment.slopeDeg}°` : ''}`).join(', ');

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block w-full" role="img" aria-label={`Terrain profile: ${description}`}>
      <polygon points={`${surface} ${WIDTH - 4},${HEIGHT} 4,${HEIGHT}`} fill="#191E25" />
      {world.segments.map((segment) => {
        const [x0, x1] = [x(segment.startM), x(segment.endM)];
        const label = `${TERRAIN_LOOK[segment.terrain].label}${segment.slopeDeg ? ` ${Math.abs(segment.slopeDeg)}°` : ''}`.toUpperCase();
        const fits = label.length * CHAR_PX < x1 - x0 - 4;
        return (
          <g key={segment.index}>
            <line
              x1={x0}
              y1={y(heights[segment.index]!)}
              x2={x1}
              y2={y(heights[segment.index + 1]!)}
              stroke={TERRAIN_LOOK[segment.terrain].hud}
              strokeWidth="5"
              strokeLinecap="round"
            />
            {segment.index > 0 ? <line x1={x0} y1={HEIGHT - LABEL_BAND + 6} x2={x0} y2={HEIGHT - 4} stroke="#2A3039" /> : null}
            {fits ? (
              <text x={(x0 + x1) / 2} y={HEIGHT - 8} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="#9AA3AE">
                {label}
              </text>
            ) : (
              <rect x={(x0 + x1) / 2 - 4} y={HEIGHT - 15} width="8" height="4" rx="2" fill={TERRAIN_LOOK[segment.terrain].hud} />
            )}
          </g>
        );
      })}
      {world.obstacles.map((obstacle) => {
        const [ox, oy] = [x(obstacle.xM), y(heightAt(obstacle.xM)) - 2];
        return <polygon key={obstacle.xM} points={`${ox - 8},${oy} ${ox},${oy - 12} ${ox + 8},${oy}`} fill="#8C949E" />;
      })}
      <circle cx={x(0) + 6} cy={y(heights[0]!) - 8} r="5" fill="#FF7A1A" />
      <line x1={finishX} y1={finishY - 26} x2={finishX} y2={finishY - 2} stroke="#EDEFF2" strokeWidth="2" />
      <polygon points={`${finishX},${finishY - 26} ${finishX - 12},${finishY - 22} ${finishX},${finishY - 18}`} fill="#EDEFF2" />
    </svg>
  );
}
