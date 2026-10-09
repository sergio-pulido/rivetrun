'use client';

// Client-only 3D stages. Each is its own lazy chunk; mount them through <Stage3D> so three.js loads after the page is usable.
import dynamic from 'next/dynamic';

export const BenchCanvas = dynamic(() => import('./BenchCanvas'), { ssr: false });
export const ExplodedCanvas = dynamic(() => import('./ExplodedCanvas'), { ssr: false });
export const PartCanvas = dynamic(() => import('./PartCanvas'), { ssr: false });
