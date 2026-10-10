'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { PresetId } from '@rivetrun/contracts';
import { PRESETS } from '@rivetrun/sim';
import { useBuildStore } from '@/state/build';
import { buildStats } from '@/ui/buildStats';
import { Meter } from '@/ui/Meter';
import { step, swipe } from './carousel';
import type { HomeCta } from './cta';

const IDS = Object.keys(PRESETS) as readonly PresetId[];
const ADVANCE_MS = 4000;
const ARROW = 'absolute top-[52px] z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line-2 bg-panel text-xl leading-none text-text-2 hover:text-text lg:static';

/**
 * The four robots, one large at a time: its render, its one line and its four bars. It moves on every 4 s unless the
 * pointer, the focus or a finger is on it, or the visitor asked for reduced motion. Arrows, dots, the arrow keys and a
 * swipe all move it. No 3D canvas: the renders are images of the exact builds.
 */
export function VehicleCarousel({ cta, className = '' }: { readonly cta: HomeCta; readonly className?: string }) {
  const router = useRouter();
  const setBuild = useBuildStore((store) => store.setBuild);
  const [index, setIndex] = useState(IDS.indexOf('all_rounder') >= 0 ? IDS.indexOf('all_rounder') : 0);
  const [held, setHeld] = useState(false);
  const dragFrom = useRef<number | null>(null);

  useEffect(() => {
    if (held || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setIndex((current) => step(current, 1, IDS.length)), ADVANCE_MS);
    return () => clearInterval(timer);
  }, [held]);

  const id = IDS[index] ?? IDS[0]!;
  const preset = PRESETS[id];
  const move = (by: number): void => setIndex((current) => step(current, by, IDS.length));
  const dots = (
    <div className="flex gap-1.5" role="tablist" aria-label="Choose a vehicle">
      {IDS.map((other, at) => (
        <button key={other} type="button" role="tab" aria-selected={at === index} aria-label={PRESETS[other].name} onClick={() => setIndex(at)} className="grid h-8 w-6 place-items-center">
          <span className={`h-2 rounded-full transition-all ${at === index ? 'w-5 bg-orange' : 'w-2 bg-line-3'}`} />
        </button>
      ))}
    </div>
  );
  const openWorkshop = (): void => {
    setBuild(preset.build);
    router.push('/workshop');
  };

  return (
    <section
      className={`relative flex min-w-0 flex-col gap-2.5 rounded-[18px] border border-[#262B33] bg-panel p-3.5 outline-none focus-visible:border-orange lg:max-h-[45vh] ${className}`}
      aria-roledescription="carousel"
      aria-label="Vehicles"
      tabIndex={0}
      data-testid="home-vehicles"
      data-vehicle={id}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') move(1);
        else if (event.key === 'ArrowLeft') move(-1);
      }}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onTouchStart={(event) => {
        setHeld(true);
        dragFrom.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const from = dragFrom.current;
        const to = event.changedTouches[0]?.clientX;
        dragFrom.current = null;
        if (from !== null && to !== undefined) move(swipe(from, to));
      }}
    >
      <div className="flex min-h-0 flex-1 items-center gap-2" aria-live="polite">
        <button type="button" onClick={() => move(-1)} className={`${ARROW} left-2`} aria-label="Previous vehicle" data-testid="home-vehicle-prev">
          ‹
        </button>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-stretch gap-3 lg:flex-row lg:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={id} src={`/renders/presets/${id}.webp`} alt={`${preset.name}, rendered from its exact build`} className="rr-rise mx-auto h-[120px] w-[170px] shrink-0 object-cover lg:h-[min(26vh,230px)] lg:w-[min(34vh,300px)]" />
          <div className="-my-1.5 flex justify-center lg:hidden">{dots}</div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div>
              <h2 className="font-display text-[26px] font-bold leading-none">{preset.name}</h2>
              <p className="mt-1 text-[13px] leading-snug text-text-2">{preset.blurb}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 lg:grid-cols-1">
              {buildStats(preset.build).bars.map((bar) => (
                <div key={bar.key} className="min-w-0" data-bar={bar.key}>
                  <dt className="flex items-baseline justify-between gap-2 font-mono text-[10px] font-medium uppercase tracking-[1px] text-muted">
                    <span>{bar.label}</span>
                    <span className="truncate text-text-2">{bar.figure}</span>
                  </dt>
                  <dd className="mt-0.5">
                    <Meter fill={bar.fill} color="var(--color-orange)" className="!h-1.5" />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <button type="button" onClick={() => move(1)} className={`${ARROW} right-2`} aria-label="Next vehicle" data-testid="home-vehicle-next">
          ›
        </button>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
        <div className="hidden items-center gap-4 lg:flex">
          {dots}
          <Link href="/workshop/real" className="whitespace-nowrap font-display text-xs font-semibold text-text-2 hover:text-text">
            Build it for real <span className="text-orange">→</span>
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex">
          <button
            type="button"
            onClick={() => {
              if (cta === 'play') router.push(`/play?preset=${id}`);
              else openWorkshop();
            }}
            className="rr-btn rr-btn-primary !min-h-10 whitespace-nowrap !px-3.5 !text-[13px]"
            data-testid="home-vehicle-race"
          >
            Race with it
          </button>
          <button type="button" onClick={openWorkshop} className="rr-btn rr-btn-secondary !min-h-10 whitespace-nowrap !px-3.5 !text-[13px]" data-testid="home-vehicle-workshop">
            Open in Workshop
          </button>
        </div>
      </div>
    </section>
  );
}
