'use client';

import { useEffect, useState } from 'react';
import { CanvasTexture, LinearFilter, SRGBColorSpace, TextureLoader, type Texture } from 'three';

// The Workshop's room: a workshop panorama from Poly Haven (polyhaven.com, CC0), the tonemapped JPG resized to
// 2048 × 1024. It stands behind the turntable, out of focus and dimmed so the rover stays the brightest thing on
// screen, and it is what the rover's metal and plastic reflect. No .hdr file is shipped.

/** The shipped panorama and how far it is turned so the calm part of the room is behind the turntable, radians. */
const PANORAMA = { file: 'workshop', turn: 0 } as const;

/** The background is drawn from a copy this wide: magnified many times over, it is out of focus by itself. */
const SOFT_WIDTH = 640;

const loader = new TextureLoader();
const cache = new Map<string, Promise<Loaded>>();

interface Loaded {
  /** The picture as shipped: what the rover reflects. */
  readonly texture: Texture;
  /** A small, soft copy: what stands behind the rover, out of focus as in a product shot. */
  readonly soft: Texture;
}

/** Shallow depth of field without a blur pass per frame: a small copy of the picture, smoothed once. */
function softened(image: HTMLImageElement): Texture | null {
  const canvas = document.createElement('canvas');
  canvas.width = SOFT_WIDTH;
  canvas.height = SOFT_WIDTH / 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Where the browser can blur a canvas it does (not every one can); the small size softens the rest.
  if ('filter' in ctx) ctx.filter = 'blur(1.4px)';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * Dev only, for comparing rooms: `?pano=<name>` loads /env/<name>.jpg, `?pano=<name>:<degrees>` also turns it.
 * A file that is not there falls back to the light studio, as in production.
 */
function chosen(): { readonly file: string; readonly turn: number } {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return PANORAMA;
  const [name, degrees] = (new URLSearchParams(window.location.search).get('pano') ?? '').split(':');
  if (!name || !/^[a-z0-9_-]+$/i.test(name)) return PANORAMA;
  return { file: name, turn: ((Number(degrees) || 0) * Math.PI) / 180 };
}

function load(file: string): Promise<Loaded> {
  const hit = cache.get(file);
  if (hit) return hit;
  const pending = loader.loadAsync(`/env/${file}.jpg`).then(async (texture) => {
    // Decoded off the main thread where the browser can: the turntable keeps turning while the room arrives.
    const image = texture.image as HTMLImageElement;
    if (typeof image.decode === 'function') await image.decode().catch(() => undefined);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return { texture, soft: softened(image) ?? texture };
  });
  pending.catch(() => cache.delete(file));
  cache.set(file, pending);
  return pending;
}

export interface Panorama extends Loaded {
  readonly turn: number;
}

/** The workshop panorama once it has loaded; null before that and if it cannot be loaded (the light studio stays). */
export function usePanorama(enabled: boolean): Panorama | null {
  const [panorama, setPanorama] = useState<Panorama | null>(null);
  useEffect(() => {
    if (!enabled) {
      setPanorama(null);
      return undefined;
    }
    let live = true;
    const { file, turn } = chosen();
    load(file).then(
      (loaded) => {
        if (live) setPanorama({ ...loaded, turn });
      },
      () => {
        if (live) setPanorama(null);
      },
    );
    return () => {
      live = false;
    };
  }, [enabled]);
  return panorama;
}
