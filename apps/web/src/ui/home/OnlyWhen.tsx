'use client';

import { useEffect, useState, type ReactNode } from 'react';

const WIDE = '(min-width: 1024px)';

interface OnlyWhenProps {
  /** true = desktop and projector (1024 px and wider) · false = phones. */
  readonly wide: boolean;
  readonly children: ReactNode;
}

/**
 * Mounts its children on one side of the 1024 px line only. For things that are costly to have twice, like the 3D
 * bench, which sits in a different place on a phone and on a desktop. The server renders the phone side.
 */
export function OnlyWhen({ wide, children }: OnlyWhenProps) {
  const [shown, setShown] = useState(!wide);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const sync = (): void => setShown(query.matches === wide);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [wide]);
  return shown ? children : null;
}
