import Link from 'next/link';
import type { MissionId } from '@rivetrun/contracts';
import { MISSION_IDS, MISSIONS } from '@rivetrun/sim';
import { TERRAIN_LOOK } from '@/game/palette';

/** Every mission as a compact thumbnail (desktop and projector): number, name, terrain strip. The Play mission is marked. */
export function MissionStrip({ playMission }: { readonly playMission: MissionId }) {
  return (
    <section className="rr-card flex min-w-0 flex-col gap-2 p-3.5" aria-label="Missions" data-testid="home-missions">
      <h2 className="rr-label">Missions</h2>
      <ul className="grid flex-1 grid-cols-3 gap-1.5">
        {MISSION_IDS.map((id) => {
          const mission = MISSIONS[id];
          const length = mission.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
          const play = id === playMission;
          return (
            <li key={id}>
              <Link href={`/brief/${id}`} data-play={play ? 'true' : undefined} className={`flex h-full flex-col justify-between gap-1.5 rounded-[10px] border px-2.5 py-2 ${play ? 'border-orange bg-[#1F150C]' : 'border-line-2 bg-panel-2'}`}>
                <span className="flex items-baseline justify-between gap-1.5 font-mono text-[10px] font-medium tracking-[1px]">
                  <span className="text-orange-soft">0{id.slice(1)}</span>
                  {play ? <span className="rounded bg-orange px-1 py-px text-[9px] font-semibold uppercase text-on-orange">Play mission</span> : <span className="text-muted">{length} m</span>}
                </span>
                <span className="truncate font-display text-[13px] font-semibold leading-tight">{mission.name}</span>
                <span className="flex h-1 overflow-hidden rounded-sm">
                  {mission.track.segments.map((segment, index) => (
                    <span key={index} style={{ width: `${(segment.lengthM / length) * 100}%`, background: TERRAIN_LOOK[segment.terrain].hud }} />
                  ))}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
