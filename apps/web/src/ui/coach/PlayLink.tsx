'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { useBuildStore } from '@/state/build';
import { useProgressStore } from '@/state/progress';
import { CoachSheet } from './CoachSheet';

interface PlayLinkProps {
  /** The run to start. */
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * A link into a run. The first time the player starts a run in a mode, it shows that mode's coach marks first;
 * after that it is a plain link. Before saved progress has loaded it never interrupts.
 */
export function PlayLink({ href, className, children }: PlayLinkProps) {
  const router = useRouter();
  const mode = useBuildStore((store) => store.mode);
  const hydrated = useProgressStore((store) => store.hydrated);
  const seen = useProgressStore((store) => store.coachSeen.includes(mode));
  const markCoachSeen = useProgressStore((store) => store.markCoachSeen);
  const [open, setOpen] = useState(false);

  const onClick = (event: MouseEvent): void => {
    if (!hydrated || seen) return;
    event.preventDefault();
    setOpen(true);
  };

  return (
    <>
      <Link href={href} className={className} onClick={onClick}>
        {children}
      </Link>
      {open ? (
        <CoachSheet
          mode={mode}
          onStart={() => {
            markCoachSeen(mode);
            router.push(href);
          }}
          onClose={() => {
            markCoachSeen(mode);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
