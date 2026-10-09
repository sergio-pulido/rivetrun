import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { TerrainId } from '@rivetrun/contracts';
import { TERRAIN_LOOK } from '../palette';
import { mulberry32 } from '../rng';

type Draw = (ctx: CanvasRenderingContext2D, size: number, rand: () => number) => void;

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = false): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
  }
  return texture;
}

function tile(base: string, seed: number, draw: Draw): CanvasTexture {
  const size = 256;
  return canvasTexture(size, size, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    draw(ctx, size, mulberry32(seed));
  }, true);
}

/** Draws at (x, y) and at the wrapped copies so the tile stays seamless. */
function wrapped(size: number, x: number, y: number, paint: (px: number, py: number) => void): void {
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) paint(x + ox, y + oy);
}

function speckle(ctx: CanvasRenderingContext2D, size: number, rand: () => number, count: number, colors: readonly string[], max: number): void {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)]!;
    const r = 0.5 + rand() * max;
    ctx.fillRect(rand() * size, rand() * size, r, r);
  }
}

function blotches(ctx: CanvasRenderingContext2D, size: number, rand: () => number, count: number, colors: readonly string[], min: number, max: number): void {
  for (let i = 0; i < count; i += 1) {
    const color = colors[Math.floor(rand() * colors.length)]!;
    const r = min + rand() * (max - min);
    wrapped(size, rand() * size, rand() * size, (px, py) => {
      const gradient = ctx.createRadialGradient(px, py, 0, px, py, r);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
}

function cracks(ctx: CanvasRenderingContext2D, size: number, rand: () => number, count: number, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let i = 0; i < count; i += 1) {
    let x = rand() * size;
    let y = rand() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k += 1) {
      x += (rand() - 0.5) * 70;
      y += (rand() - 0.5) * 70;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

const TERRAIN_DRAW: Readonly<Record<TerrainId, Draw>> = {
  asphalt: (ctx, size, rand) => {
    speckle(ctx, size, rand, 2600, ['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.16)', 'rgba(170,180,190,0.12)'], 1.8);
    blotches(ctx, size, rand, 6, ['rgba(0,0,0,0.10)'], 30, 70);
    cracks(ctx, size, rand, 2, 'rgba(20,22,26,0.35)', 1);
  },
  grass: (ctx, size, rand) => {
    blotches(ctx, size, rand, 16, ['rgba(40,110,30,0.35)', 'rgba(150,215,90,0.28)'], 18, 55);
    for (let i = 0; i < 900; i += 1) {
      ctx.strokeStyle = rand() < 0.5 ? 'rgba(35,95,28,0.5)' : 'rgba(175,230,110,0.45)';
      ctx.lineWidth = 1;
      const x = rand() * size;
      const y = rand() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 4, y - 3 - rand() * 5);
      ctx.stroke();
    }
  },
  sand: (ctx, size, rand) => {
    ctx.strokeStyle = 'rgba(190,150,80,0.28)';
    ctx.lineWidth = 2;
    for (let row = 0; row < 8; row += 1) {
      const y0 = (row + 0.5) * (size / 8);
      ctx.beginPath();
      for (let x = 0; x <= size; x += 8) ctx.lineTo(x, y0 + Math.sin((x / size) * Math.PI * 4 + row) * 5);
      ctx.stroke();
    }
    speckle(ctx, size, rand, 3200, ['rgba(255,240,200,0.5)', 'rgba(170,125,60,0.35)'], 1.2);
  },
  mud: (ctx, size, rand) => {
    blotches(ctx, size, rand, 22, ['rgba(40,22,10,0.55)', 'rgba(140,95,60,0.35)'], 14, 48);
    speckle(ctx, size, rand, 500, ['rgba(20,10,5,0.4)', 'rgba(190,150,110,0.25)'], 2.2);
  },
  ice: (ctx, size, rand) => {
    blotches(ctx, size, rand, 14, ['rgba(255,255,255,0.55)', 'rgba(110,190,235,0.35)'], 20, 70);
    cracks(ctx, size, rand, 5, 'rgba(255,255,255,0.8)', 1.2);
    cracks(ctx, size, rand, 3, 'rgba(70,150,205,0.45)', 1);
  },
  water: (ctx, size, rand) => {
    blotches(ctx, size, rand, 14, ['rgba(120,95,50,0.35)', 'rgba(240,220,170,0.3)'], 14, 40);
    speckle(ctx, size, rand, 900, ['rgba(255,240,200,0.35)', 'rgba(110,85,45,0.3)'], 1.6);
  },
  rock: (ctx, size, rand) => {
    for (let i = 0; i < 26; i += 1) {
      const shade = Math.floor(95 + rand() * 75);
      ctx.fillStyle = `rgba(${shade},${shade + 4},${shade + 12},0.5)`;
      const x = rand() * size;
      const y = rand() * size;
      wrapped(size, x, y, (px, py) => {
        ctx.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const angle = (k / 6) * Math.PI * 2;
          const r = 16 + ((i * 7 + k * 13) % 22);
          ctx.lineTo(px + Math.cos(angle) * r, py + Math.sin(angle) * r);
        }
        ctx.fill();
      });
    }
    cracks(ctx, size, rand, 6, 'rgba(30,32,38,0.55)', 1.4);
    speckle(ctx, size, rand, 700, ['rgba(255,255,255,0.14)', 'rgba(0,0,0,0.18)'], 1.6);
  },
};

const cache = new Map<string, CanvasTexture>();
const memo = (key: string, make: () => CanvasTexture): CanvasTexture => {
  const cached = cache.get(key);
  if (cached) return cached;
  const made = make();
  cache.set(key, made);
  return made;
};

export const terrainTexture = (terrain: TerrainId): CanvasTexture =>
  memo(`terrain:${terrain}`, () => tile(terrain === 'water' ? '#cdb47a' : TERRAIN_LOOK[terrain].top, terrain.length * 31 + 7, TERRAIN_DRAW[terrain]));

/** Concrete of the start / finish pads. */
export const padTexture = (): CanvasTexture =>
  memo('pad', () =>
    tile('#737882', 91, (ctx, size, rand) => {
      speckle(ctx, size, rand, 1800, ['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.12)'], 1.6);
      ctx.strokeStyle = 'rgba(30,34,40,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, size, size);
    }),
  );

/** Soil cut face: strata and pebbles. */
export const earthTexture = (): CanvasTexture =>
  memo('earth', () =>
    tile('#6b4a31', 5, (ctx, size, rand) => {
      const bands = ['#7a5638', '#5e4029', '#6f4d33', '#523623', '#644530', '#4a3020'];
      const h = size / bands.length;
      bands.forEach((band, i) => {
        ctx.fillStyle = band;
        ctx.beginPath();
        ctx.moveTo(0, i * h);
        for (let x = 0; x <= size; x += 16) ctx.lineTo(x, i * h + Math.sin((x / size) * Math.PI * 2 * (1 + (i % 3)) + i) * 5);
        ctx.lineTo(size, (i + 1) * h + 8);
        ctx.lineTo(0, (i + 1) * h + 8);
        ctx.fill();
      });
      for (let i = 0; i < 46; i += 1) {
        ctx.fillStyle = rand() < 0.5 ? 'rgba(170,160,150,0.55)' : 'rgba(40,26,16,0.5)';
        const x = rand() * size;
        const y = rand() * size;
        const rx = 2 + rand() * 7;
        wrapped(size, x, y, (px, py) => {
          ctx.beginPath();
          ctx.ellipse(px, py, rx, rx * 0.65, 0, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      speckle(ctx, size, rand, 1200, ['rgba(255,225,190,0.10)', 'rgba(0,0,0,0.16)'], 1.8);
    }),
  );

export const hazardTexture = (): CanvasTexture =>
  memo('hazard', () =>
    canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = '#f6c51c';
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#15171b';
      for (let i = -128; i < 256; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 32, 0);
        ctx.lineTo(i + 32 + 128, 128);
        ctx.lineTo(i + 128, 128);
        ctx.fill();
      }
    }, true),
  );

export const checkerTexture = (): CanvasTexture =>
  memo('checker', () =>
    canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = '#f4f6f8';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#15171b';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillRect(32, 32, 32, 32);
    }, true),
  );

export const glowTexture = (): CanvasTexture =>
  memo('glow', () =>
    canvasTexture(128, 128, (ctx) => {
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
    }),
  );

export function skyTexture(top: string, mid: string, horizon: string): CanvasTexture {
  return memo(`sky:${top}${mid}${horizon}`, () =>
    canvasTexture(4, 256, (ctx) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, top);
      gradient.addColorStop(0.17, mid);
      gradient.addColorStop(0.36, horizon);
      gradient.addColorStop(1, horizon);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 4, 256);
    }),
  );
}

interface LabelStyle {
  readonly color: string;
  readonly background: string;
  readonly border?: string;
}

/** Sign / tag texture, 4:1. */
export function labelTexture(text: string, style: LabelStyle): CanvasTexture {
  return memo(`label:${text}:${style.color}:${style.background}:${style.border ?? ''}`, () =>
    canvasTexture(256, 64, (ctx) => {
      ctx.fillStyle = style.background;
      ctx.beginPath();
      ctx.roundRect(2, 2, 252, 60, 14);
      ctx.fill();
      if (style.border) {
        ctx.strokeStyle = style.border;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.fillStyle = style.color;
      ctx.font = '700 34px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 34);
    }),
  );
}
