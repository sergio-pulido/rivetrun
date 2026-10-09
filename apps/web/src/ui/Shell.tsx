import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { PointsChip } from './PointsChip';

interface ShellProps {
  /** Where the back key goes. */
  readonly back: string;
  /** Silk-screen line above the title, e.g. "M1 · MISSION BRIEF". */
  readonly kicker: string;
  readonly title: string;
  readonly children: ReactNode;
  /** Pinned to the bottom of the screen: the screen's main action. */
  readonly footer?: ReactNode;
}

/** Shared frame for every screen after Home: back key, title block, points, pinned action bar. */
export function Shell({ back, kicker, title, children, footer }: ShellProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(12px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3 pb-3">
        <Link
          href={back}
          aria-label="Back"
          className="rr-btn rr-btn-secondary !min-h-11 w-11 shrink-0 !rounded-xl !px-0"
        >
          <Icon name="back" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="rr-label !text-safety">{kicker}</div>
          <h1 className="mt-1 truncate text-xl font-bold leading-tight tracking-tight">{title}</h1>
        </div>
        <PointsChip />
      </header>
      <div className="flex flex-1 flex-col gap-3 pb-4">{children}</div>
      {footer ? (
        <div className="sticky bottom-0 z-20 -mx-4 bg-gradient-to-t from-slate-ink via-slate-ink/95 to-transparent px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-5">
          {footer}
        </div>
      ) : null}
    </main>
  );
}
