import { BufferGeometry, Color, Float32BufferAttribute } from 'three';

export type P3 = readonly [number, number, number];
export type P2 = readonly [number, number];

/** Collects quads into one indexed BufferGeometry (positions, uvs, vertex colours). */
export class QuadBuilder {
  private readonly positions: number[] = [];
  private readonly uvs: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private readonly scratch = new Color();

  /** Counter-clockwise as seen from the visible side. */
  quad(a: P3, b: P3, c: P3, d: P3, uv?: readonly [P2, P2, P2, P2], colors?: readonly [string, string, string, string]): this {
    const base = this.positions.length / 3;
    [a, b, c, d].forEach((point, i) => {
      this.positions.push(point[0], point[1], point[2]);
      const coordinate = uv?.[i] ?? [0, 0];
      this.uvs.push(coordinate[0], coordinate[1]);
      this.scratch.set(colors?.[i] ?? '#ffffff');
      this.colors.push(this.scratch.r, this.scratch.g, this.scratch.b);
    });
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }

  get empty(): boolean {
    return this.indices.length === 0;
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}
