'use client';

// Client-only 3D stages owned by the ui session. They mount the game session's part models.
import dynamic from 'next/dynamic';

export const ExplodedCanvas = dynamic(() => import('./ExplodedCanvas'), { ssr: false });
export const PartCanvas = dynamic(() => import('./PartCanvas'), { ssr: false });
