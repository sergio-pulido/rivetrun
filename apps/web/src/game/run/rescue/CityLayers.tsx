'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial, MirroredRepeatWrapping, SRGBColorSpace, TextureLoader, type Mesh, type Texture } from 'three';
import { LANES } from '../../palette';
import { ENV_BASE, LAYERS, LAYER_ASPECT, type LayerSpec } from './kit';

// The M7 backdrop: three pictures of the wrecked city behind the track, far to near. They share one frame (the
// same 15° side camera), so they are sized to cover the same part of the view from where the run camera sits, and
// each passes at its own speed.

/** The run camera on a phone held upright, relative to the track: where the three layers line up exactly. */
const EYE = { y: 9.2, z: 21.5 } as const;
/** The pictures span from this far below eye level (top edge)… */
const TOP_DROP = 0.025;
/** …over this much, both per unit of distance: about half the height of a phone screen, the far ground meeting the sky a third of the way down. */
const SPAN = 0.372;
/** The picture is drawn this many times side by side, mirrored at each seam: wide enough for a projector. */
const TILES = 2;
/** The top of each picture fades out over this fraction, so smoke columns end in the sky and not at an edge. */
const FADE = 0.14;
/** Phones and weak devices get the pictures at half size: a quarter of the texture memory, and still more texels than screen pixels. */
const SMALL_WIDTH = 2048;
const PHONE_MAX_SIDE = 600;
/** The city fades in over the dusk sky once its pictures are in. */
const FADE_IN_S = 0.7;

const loader = new TextureLoader();
const cache = new Map<string, Promise<Texture>>();

function halved(texture: Texture): Texture {
  const image = texture.image as HTMLImageElement;
  if (image.width <= SMALL_WIDTH) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = SMALL_WIDTH;
  canvas.height = Math.round((image.height * SMALL_WIDTH) / image.width);
  const ctx = canvas.getContext('2d');
  if (!ctx) return texture;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  texture.dispose();
  return new CanvasTexture(canvas);
}

function loadLayer(spec: LayerSpec, small: boolean): Promise<Texture> {
  const key = `${spec.file}|${small}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = loader.loadAsync(`${ENV_BASE}/${spec.file}`).then(async (loaded) => {
    // Decoded off the main thread where the browser can, so the picture costs the run no long frame.
    const image = loaded.image as HTMLImageElement;
    if (typeof image.decode === 'function') await image.decode().catch(() => undefined);
    const texture = small ? halved(loaded) : loaded;
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = MirroredRepeatWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  });
  // A layer that failed is not cached: the next run may try again.
  pending.catch(() => cache.delete(key));
  cache.set(key, pending);
  return pending;
}

export interface LoadedLayer {
  readonly spec: LayerSpec;
  readonly texture: Texture;
}

export interface CityState {
  /** All the pictures, once every one of them is in: the city never appears with a layer missing. */
  readonly layers: readonly LoadedLayer[] | null;
  /** A picture is missing or broken: the caller draws its own backdrop instead. */
  readonly failed: boolean;
}

const WAITING: CityState = { layers: null, failed: false };

/**
 * The backdrop pictures. Loading starts when `enabled` turns true. `near` false leaves the nearest layer out;
 * `weak` (and any phone-sized screen) takes the pictures at half size.
 */
export function useCityLayers(enabled: boolean, near: boolean, weak: boolean): CityState {
  const [state, setState] = useState<CityState>(WAITING);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const small = weak || Math.min(window.innerWidth, window.innerHeight) < PHONE_MAX_SIDE;
    const wanted = LAYERS.filter((spec) => near || !spec.nearest);
    Promise.all(wanted.map(async (spec) => ({ spec, texture: await loadLayer(spec, small) }))).then(
      (layers) => {
        if (live) setState({ layers, failed: false });
      },
      () => {
        if (live) setState({ layers: null, failed: true });
      },
    );
    return () => {
      live = false;
    };
  }, [enabled, near, weak]);
  return state;
}

/** A wide strip with the picture repeated along it and its top edge faded out. */
function stripGeometry(width: number, height: number): BufferGeometry {
  const rows: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [1 - FADE, 1],
    [0, 1],
  ];
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  for (const [v, alpha] of rows) {
    for (const u of [0, 1]) {
      positions.push((u - 0.5) * width, (v - 0.5) * height, 0);
      uvs.push(u * TILES, v);
      colors.push(1, 1, 1, alpha);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 4));
  geometry.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]);
  return geometry;
}

interface CityLayersProps {
  layers: readonly LoadedLayer[];
  /** World height the track sits around. */
  mid: number;
}

/** The parallax layers. Three large see-through quads: the scene's fog hazes the far ones more. */
export function CityLayers({ layers, mid }: CityLayersProps) {
  const camera = useThree((state) => state.camera);
  const meshes = useRef<Array<Mesh | null>>([]);
  const strips = useMemo(
    () =>
      layers.map(({ spec, texture }) => {
        const distance = EYE.z - spec.z;
        const height = SPAN * distance;
        const width = height * LAYER_ASPECT;
        return {
          spec,
          texture,
          width,
          y: mid + EYE.y - TOP_DROP * distance - height / 2,
          geometry: stripGeometry(width * TILES, height),
          material: new MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, vertexColors: true }),
        };
      }),
    [layers, mid],
  );
  useEffect(
    () => () => {
      for (const strip of strips) {
        strip.geometry.dispose();
        strip.material.dispose();
      }
    },
    [strips],
  );

  useFrame((_, dt) => {
    const toTrack = Math.max(1, camera.position.z - LANES.player);
    strips.forEach((strip, i) => {
      const mesh = meshes.current[i];
      if (!mesh) return;
      if (strip.material.opacity < 1) strip.material.opacity = Math.min(1, strip.material.opacity + Math.min(dt, 0.1) / FADE_IN_S);
      // The strip stays in front of the camera; the picture slides along it at the layer's share of the track's speed.
      mesh.position.x = camera.position.x;
      const rate = (strip.spec.parallax * (camera.position.z - strip.spec.z)) / toTrack;
      strip.texture.offset.x = (camera.position.x * rate) / strip.width - TILES / 2;
    });
  });

  return (
    <group dispose={null}>
      {strips.map((strip, i) => (
        <mesh
          key={strip.spec.id}
          ref={(node) => {
            meshes.current[i] = node;
          }}
          geometry={strip.geometry}
          material={strip.material}
          position={[0, strip.y, strip.spec.z]}
          renderOrder={-6 + i}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
