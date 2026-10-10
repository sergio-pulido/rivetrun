'use client';

import { useEffect, useRef } from 'react';
import { TERRAIN_LOOK } from '@/game/palette';
import { Icon } from '@/ui/Icon';
import type { ScenarioSegment } from './scenario';
import { VERDICT_LOOK } from './verdict';

/** The page's side gutter: a card scrolled into view lines up with the rest of the page. */
const GUTTER_PX = 16;

function SegmentCard({ segment }: { readonly segment: ScenarioSegment }) {
  const look = segment.verdict ? VERDICT_LOOK[segment.verdict] : null;
  const unreached = segment.verdict === 'not_reached';
  // Wide screens (a projector): the cards share the full width and the type is large enough to read across a room.
  return (
    <li data-verdict={segment.verdict ?? undefined} className={`flex w-[168px] shrink-0 snap-start flex-col gap-1.5 rounded-xl border bg-panel p-2.5 lg:w-auto lg:gap-2 lg:p-3.5 ${look?.frame ?? 'border-line'} ${unreached ? 'opacity-70' : ''}`}>
      <div className="flex items-center justify-between gap-1.5 font-mono text-[10px] tracking-[1px] lg:text-[13px]">
        <span className="tabular-nums text-muted">
          {segment.startM}–{segment.endM} M
        </span>
        {look ? <span className={`rounded-md border px-1.5 py-0.5 font-medium uppercase ${look.badge}`}>{look.label}</span> : null}
      </div>
      <div className="flex items-center gap-1.5 lg:gap-2">
        <span className="h-3.5 w-1.5 shrink-0 rounded-sm lg:h-5 lg:w-2" style={{ background: TERRAIN_LOOK[segment.terrain].hud }} />
        <span className="truncate font-display text-[15px] font-semibold leading-tight lg:text-[22px]">{TERRAIN_LOOK[segment.terrain].label}</span>
      </div>
      <p className="min-h-[15px] text-[11px] leading-tight text-text-2 lg:min-h-[20px] lg:text-[15px] lg:leading-snug">{segment.facts.join(' · ')}</p>
      {segment.demands.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t border-line pt-1.5 lg:gap-1.5 lg:pt-2">
          {segment.demands.map((demand) => (
            <li key={demand.label} className={`flex items-start gap-1 text-[11px] leading-tight lg:gap-1.5 lg:text-[15px] lg:leading-snug ${demand.met === false ? 'text-warn' : 'text-text-2'}`}>
              {demand.met === null ? <span className="w-3 shrink-0 text-center text-faint">·</span> : <Icon name={demand.met ? 'check' : 'close'} size={12} className={`mt-px shrink-0 lg:mt-1 lg:scale-125 ${demand.met ? 'text-ok' : 'text-warn'}`} />}
              <span className="min-w-0">{demand.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line pt-1.5 text-[11px] leading-tight text-faint lg:pt-2 lg:text-[15px]">No demands</p>
      )}
      {segment.note ? <p className={`mt-auto text-[11px] leading-tight lg:text-[15px] lg:leading-snug ${segment.verdict === 'fail' ? 'text-bad' : 'text-orange-soft'}`}>{segment.note}</p> : null}
    </li>
  );
}

interface ScenarioStripProps {
  readonly segments: readonly ScenarioSegment[];
  /** The build the verdicts are for, by name. */
  readonly buildName: string;
}

/** The mission as a strip of segments: what is on each, what it demands, and how the current build does there. */
export function ScenarioStrip({ segments, buildName }: ScenarioStripProps) {
  const strip = useRef<HTMLUListElement>(null);
  const failIndex = segments.findIndex((segment) => segment.verdict === 'fail');

  // Bring the segment where the build fails into view, sideways only: the page itself must not jump.
  useEffect(() => {
    const list = strip.current;
    const card = failIndex >= 0 ? (list?.children[failIndex] as HTMLElement | undefined) : undefined;
    if (!list) return;
    list.scrollTo({ left: card ? Math.max(0, card.offsetLeft - list.offsetLeft - GUTTER_PX) : 0, behavior: 'smooth' });
  }, [failIndex]);

  const verdicts = segments.some((segment) => segment.verdict);
  return (
    <section className="flex flex-col gap-2" aria-label="Scenario">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="rr-label lg:!text-[13px]">Scenario · {segments.length} segments</h3>
        {verdicts ? <span className="truncate font-mono text-[10px] tracking-[1px] text-muted lg:text-[13px]">VERDICTS FOR {buildName.toUpperCase()}</span> : null}
      </div>
      {/* A swipeable strip on a phone; on wide screens every segment is in view at once, in rows across the full width. */}
      <ul ref={strip} className="rr-scroll-x -mx-4 flex scroll-px-4 gap-2 px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(196px,1fr))] lg:gap-3 lg:overflow-visible lg:px-0">
        {segments.map((segment) => (
          <SegmentCard key={segment.index} segment={segment} />
        ))}
      </ul>
    </section>
  );
}
