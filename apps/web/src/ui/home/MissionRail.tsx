'use client';

import Link from 'next/link';
import { MISSION_IDS, MISSIONS } from '@rivetrun/sim';
import { TERRAIN_LOOK } from '@/game/palette';
import { useProgressStore } from '@/state/progress';
import { Stars } from '@/ui/Stars';

/** Every mission as a card: terrain strip, weather, best stars. Each opens its brief. */
export function MissionRail() {
  const best = useProgressStore((store) => store.best);
  return (
    <ul className="rr-scroll-x -mx-5 flex gap-2.5 px-5 pb-1">
      {MISSION_IDS.map((id) => {
        const mission = MISSIONS[id];
        const length = mission.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
        return (
          <li key={id} className="w-[150px] shrink-0 snap-start">
            <Link href={`/brief/${id}`} className="rr-card block p-3 active:bg-panel-2">
              <div className="flex items-center justify-between font-mono text-[10px] font-medium tracking-[1.5px]">
                <span className="text-orange-soft">MISSION 0{id.slice(1)}</span>
                <span className="uppercase text-muted">{mission.weather}</span>
              </div>
              <div className="mt-1.5 truncate font-display text-[15px] font-semibold">{mission.name}</div>
              <div className="mt-2 flex h-[5px] overflow-hidden rounded-[3px]">
                {mission.track.segments.map((segment, index) => (
                  <span key={index} style={{ width: `${(segment.lengthM / length) * 100}%`, background: TERRAIN_LOOK[segment.terrain].hud }} />
                ))}
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <Stars count={best[id]?.stars ?? 0} size={13} />
                <span className="font-mono text-[10px] text-muted">{length} m</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
