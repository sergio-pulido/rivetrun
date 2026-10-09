'use client';

// The only entry point pages use for 3D. three.js never renders on the server:
// both canvases are loaded with next/dynamic and ssr: false.
import dynamic from 'next/dynamic';

export const RunCanvas = dynamic(() => import('./RunCanvas'), { ssr: false });
export const WorkshopCanvas = dynamic(() => import('./WorkshopCanvas'), { ssr: false });
