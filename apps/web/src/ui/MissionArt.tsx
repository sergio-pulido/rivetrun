'use client';

import { useState } from 'react';
import type { MissionId } from '@rivetrun/contracts';

interface MissionArtProps {
  readonly id: MissionId;
  /** Size, crop and placement of the picture. */
  readonly className?: string;
}

/**
 * A mission's thumbnail (public/renders/missions/<id>.webp). Decoration beside a card's own text: when the picture
 * is missing or does not load it renders nothing, and the card is the text card it was.
 */
export function MissionArt({ id, className = '' }: MissionArtProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/renders/missions/${id}.webp`} alt="" decoding="async" onError={() => setFailed(true)} className={className} data-testid={`mission-art-${id}`} />;
}
