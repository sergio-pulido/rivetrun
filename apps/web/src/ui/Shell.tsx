import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';

interface ShellProps {
  /** Where the back chevron goes. Without it the chevron goes back in history. */
  readonly back?: string;
  /** The page's name, shown under the logo in the shared header. */
  readonly title: string;
  /** One compact item left of the menu, e.g. the Workshop's budget. */
  readonly right?: ReactNode;
  readonly children: ReactNode;
  /** Pinned to the bottom of the screen: the screen's main actions. */
  readonly footer?: ReactNode;
  readonly className?: string;
}

/** Shared frame of every phone screen: the app header, 16 px gutters, pinned action bar. */
export function Shell({ back, title, right, children, footer, className = '' }: ShellProps) {
  return (
    <main className={`mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pt-[max(18px,env(safe-area-inset-top))] ${className}`}>
      <AppHeader back={back} label={title} right={right} />
      <div className="flex flex-1 flex-col gap-3 pb-4 pt-3">{children}</div>
      {footer ? (
        <div className="sticky bottom-0 z-20 -mx-4 bg-gradient-to-t from-ground from-70% to-transparent px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-4">
          {footer}
        </div>
      ) : null}
    </main>
  );
}
