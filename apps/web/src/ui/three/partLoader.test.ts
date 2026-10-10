import { describe, expect, it } from 'vitest';
import type { BufferGeometry, Mesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createPartLoader } from './partLoader';

// One triangle, compressed with EXT_meshopt_compression (required), as the part models are. Made once with meshoptimizer's encoder.
const MESHOPT_GLB = 'Z2xURgIAAABIBAAA5AMAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAiLCJnZW5lcmF0b3IiOiJyaXZldHJ1biB0ZXN0IGZpeHR1cmUifSwiZXh0ZW5zaW9uc1VzZWQiOlsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iXSwiZXh0ZW5zaW9uc1JlcXVpcmVkIjpbIkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIl0sInNjZW5lIjowLCJzY2VuZXMiOlt7Im5vZGVzIjpbMF19XSwibm9kZXMiOlt7Im1lc2giOjAsIm5hbWUiOiJ0cmlhbmdsZSJ9XSwibWVzaGVzIjpbeyJwcmltaXRpdmVzIjpbeyJhdHRyaWJ1dGVzIjp7IlBPU0lUSU9OIjowfSwiaW5kaWNlcyI6MX1dfV0sImFjY2Vzc29ycyI6W3siYnVmZmVyVmlldyI6MCwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjMsInR5cGUiOiJWRUMzIiwibWluIjpbMCwwLDBdLCJtYXgiOlswLjA0LDAuMDMsMF19LHsiYnVmZmVyVmlldyI6MSwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjMsInR5cGUiOiJTQ0FMQVIifV0sImJ1ZmZlclZpZXdzIjpbeyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjAsImJ5dGVMZW5ndGgiOjM2LCJieXRlU3RyaWRlIjoxMiwidGFyZ2V0IjozNDk2MiwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjAsImJ5dGVMZW5ndGgiOjUyLCJieXRlU3RyaWRlIjoxMiwiY291bnQiOjMsIm1vZGUiOiJBVFRSSUJVVEVTIn19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6MzYsImJ5dGVMZW5ndGgiOjYsInRhcmdldCI6MzQ5NjMsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo1MiwiYnl0ZUxlbmd0aCI6MTgsImJ5dGVTdHJpZGUiOjIsImNvdW50IjozLCJtb2RlIjoiVFJJQU5HTEVTIn19fV0sImJ1ZmZlcnMiOlt7ImJ5dGVMZW5ndGgiOjcyfSx7ImJ5dGVMZW5ndGgiOjQ0LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImZhbGxiYWNrIjp0cnVlfX19XX0gICBIAAAAQklOAKH//6oAFBMAUVIARkUAenkAAOEAAHsAABUAAHgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADh8AB2h1ZneKmGZYlomAFpAAAAAA==';

const glb = (): ArrayBuffer => {
  const bytes = Uint8Array.from(atob(MESHOPT_GLB), (char) => char.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

describe('createPartLoader', () => {
  it('decodes a meshopt-compressed model', async () => {
    const gltf = await createPartLoader().parseAsync(glb(), '');
    const mesh = gltf.scene.getObjectByName('triangle') as Mesh<BufferGeometry>;
    expect(Array.from(mesh.geometry.getAttribute('position').array).map((value) => Math.round(value * 1000) / 1000)).toEqual([0, 0, 0, 0.04, 0, 0, 0, 0.03, 0]);
    expect(Array.from(mesh.geometry.getIndex()!.array)).toEqual([0, 1, 2]);
  });

  it('is what makes it load: a bare loader refuses the same file', async () => {
    await expect(new GLTFLoader().parseAsync(glb(), '')).rejects.toThrow(/meshopt/i);
  });

  it('has no Draco decoder set up', () => {
    expect(createPartLoader().dracoLoader).toBeNull();
  });
});
