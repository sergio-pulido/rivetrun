'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { MissionId } from '@rivetrun/contracts';
import { MISSION_IDS, MISSIONS } from '@rivetrun/sim';
import { TERRAIN_LOOK } from '@/game/palette';
import { useProgressStore } from '@/state/progress';
import { Stars } from '@/ui/Stars';
import { pageCount, pageOf, playFirst, step } from './carousel';

/** Desktop and projector: three across, two rows, the rest behind the pager. */
const PER_PAGE = 6;
const PAGER = 'grid h-7 w-7 place-items-center rounded-full border border-line-2 bg-panel text-base leading-none text-text-2 hover:text-text';

/**
 * Home's one missions list: the Play mission first, then the others in order. A phone gets a row to swipe through;
 * a desktop gets a 3 × 2 grid with a pager. Each card opens the mission's brief.
 */
export function Missions({ playMission, className = '' }: { readonly playMission: MissionId; readonly className?: string }) {
  const best = useProgressStore((store) => store.best);
  const [page, setPage] = useState(0);
  const ids = playFirst(MISSION_IDS, playMission);
  const pages = pageCount(ids.length, PER_PAGE);

  return (
    <section className={`flex min-w-0 flex-col gap-2 ${className}`} aria-label="Missions" data-testid="home-missions" data-page={page + 1}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="rr-label">Missions</h2>
        {pages > 1 ? (
          <div className="hidden items-center gap-2 lg:flex" data-testid="home-missions-pager">
            <button type="button" onClick={() => setPage((current) => step(current, -1, pages))} className={PAGER} aria-label="Previous missions">
              ‹
            </button>
            <span className="font-mono text-xs tabular-nums text-text-2" aria-live="polite">
              {page + 1}/{pages}
            </span>
            <button type="button" onClick={() => setPage((current) => step(current, 1, pages))} className={PAGER} aria-label="Next missions">
              ›
            </button>
          </div>
        ) : null}
      </div>
      <ul className="rr-scroll-x -mx-5 flex gap-2.5 px-5 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-2 lg:overflow-visible lg:px-0 lg:pb-0">
        {ids.map((id, at) => {
          const mission = MISSIONS[id];
          const length = mission.track.segments.reduce((sum, segment) => sum + segment.lengthM, 0);
          const play = id === playMission;
          return (
            <li key={id} className={`w-[156px] shrink-0 snap-start lg:w-auto ${pageOf(at, PER_PAGE) === page ? '' : 'lg:hidden'}`}>
              <Link href={`/brief/${id}`} data-play={play ? 'true' : undefined} className={`flex h-full flex-col gap-1.5 rounded-[12px] border p-2.5 active:bg-panel-2 lg:gap-1 lg:p-2 ${play ? 'border-orange bg-[#1F150C]' : 'border-line bg-panel'}`}>
                <span className="flex items-center justify-between gap-1.5 font-mono text-[10px] font-medium tracking-[1px]">
                  <span className="whitespace-nowrap text-orange-soft">{play ? '' : <span className="lg:hidden">MISSION </span>}0{id.slice(1)}</span>
                  {play ? <span className="whitespace-nowrap rounded bg-orange px-1 py-px text-[9px] font-semibold uppercase text-on-orange">Play mission</span> : <span className="rounded border border-line-3 px-1 py-px uppercase text-muted">{mission.weather}</span>}
                </span>
                <span className="truncate font-display text-[14px] font-semibold leading-tight">{mission.name}</span>
                <span className="flex h-[5px] overflow-hidden rounded-[3px]">
                  {mission.track.segments.map((segment, index) => (
                    <span key={index} style={{ width: `${(segment.lengthM / length) * 100}%`, background: TERRAIN_LOOK[segment.terrain].hud }} />
                  ))}
                </span>
                <span className="flex items-center justify-between">
                  <Stars count={best[id]?.stars ?? 0} size={12} />
                  <span className="font-mono text-[10px] text-muted">
                    {play ? `${mission.weather} · ` : ''}
                    {length} m
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
