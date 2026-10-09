import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface ShellProps {
  /** Where the back key goes. Omit for screens that close instead (part sheet, result). */
  readonly back?: string;
  /** Centred in the top bar: display caps by default. */
  readonly title: string;
  /** Mono data-label style title (mission number, part counter). */
  readonly titleStyle?: 'display' | 'label';
  /** Right end of the top bar, 44 px tall. Defaults to an empty spacer so the title stays centred. */
  readonly right?: ReactNode;
  readonly children: ReactNode;
  /** Pinned to the bottom of the screen: the screen's main actions. */
  readonly footer?: ReactNode;
  /** Home draws on the blueprint grid; every other screen is plain ground. */
  readonly className?: string;
}

/** Shared frame of every screen: 44 px top bar (back, title, one slot), 16 px gutters, pinned action bar. */
export function Shell({ back, title, titleStyle = 'display', right, children, footer, className = '' }: ShellProps) {
  return (
    <main className={`mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pt-[max(18px,env(safe-area-inset-top))] ${className}`}>
      <header className="flex h-11 shrink-0 items-center justify-between gap-3">
        {back ? (
          <Link href={back} aria-label="Back" className="rr-iconbtn">
            <Icon name="back" />
          </Link>
        ) : (
          <span className="w-11 shrink-0" />
        )}
        <h1
          className={
            titleStyle === 'display'
              ? 'truncate font-display text-[17px] font-bold uppercase tracking-[3px]'
              : 'truncate font-mono text-[11px] font-medium uppercase tracking-[2px] text-muted'
          }
        >
          {title}
        </h1>
        {right ?? <span className="w-11 shrink-0" />}
      </header>
      <div className="flex flex-1 flex-col gap-3 pb-4 pt-3">{children}</div>
      {footer ? (
        <div className="sticky bottom-0 z-20 -mx-4 bg-gradient-to-t from-ground from-70% to-transparent px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-4">
          {footer}
        </div>
      ) : null}
    </main>
  );
}
