'use client';

import Link from 'next/link';
import { MISSION_IDS, MISSIONS } from '@rivetrun/sim';
import { TERRAIN_LOOK } from '@/game/palette';
import { useProgressStore } from '@/state/progress';
import { Icon, type IconName } from '@/ui/Icon';
import { Stars } from '@/ui/Stars';

const WEATHER_ICON: Readonly<Record<string, IconName>> = { clear: 'sun', rain: 'rain', cold: 'cold' };

/** Every mission as a card: terrain strip, weather, best stars. Each opens its brief. */
export function MissionRail() {
  const best = useProgressStore((store) => store.best);
  return (
    <ul className="rr-scroll-x -mx-4 flex gap-2.5 px-4 pb-2">
      {MISSION_IDS.map((id) => {
        const mission = MISSIONS[id];
        const length = mission.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
        return (
          <li key={id} className="w-[148px] shrink-0 snap-start">
            <Link href={`/brief/${id}`} className="rr-panel block p-3 transition-transform active:translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-safety">{id}</span>
                <span className="text-dim">
                  <Icon name={WEATHER_ICON[mission.weather] ?? 'sun'} size={15} />
                </span>
              </div>
              <div className="mt-1 truncate text-sm font-semibold">{mission.name}</div>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full">
                {mission.track.segments.map((segment, index) => (
                  <span key={index} style={{ width: `${(segment.lengthM / length) * 100}%`, background: TERRAIN_LOOK[segment.terrain].hud }} />
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <Stars count={best[id]?.stars ?? 0} size={13} />
                <span className="font-mono text-[10px] text-dim">{length} m</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
