import { BackSide, BufferGeometry, Color, Mesh, ShaderMaterial, type InstancedMesh, type Object3D } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { UI } from '../palette';

// Selection outline: an inverted hull. Each mesh of the selected part gets a slightly larger copy of
// itself drawn back-faces-only in the brain cyan, so the part reads with a rim around it and along its
// seams. No post-processing pass, so it costs a few draw calls only while something is selected.

const OUTLINE = new ShaderMaterial({
  uniforms: { color: { value: new Color(UI.cyan) }, thickness: { value: 0.024 } },
  vertexShader: /* glsl */ `
    uniform float thickness;
    void main() {
      vec4 view = modelViewMatrix * vec4(position, 1.0);
      // Pushed out in view space, so the rim is the same width whatever the mesh's own scale.
      view.xyz += normalize(normalMatrix * normal) * thickness;
      gl_Position = projectionMatrix * view;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    void main() {
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
    }
  `,
  side: BackSide,
  fog: false,
});

const shells = new WeakMap<BufferGeometry, BufferGeometry>();

/** Position-only copy with welded vertices and smooth normals: hard-edged boxes then swell into a closed shell. */
function shellOf(source: BufferGeometry): BufferGeometry {
  const cached = shells.get(source);
  if (cached) return cached;
  const bare = new BufferGeometry();
  bare.setAttribute('position', source.getAttribute('position').clone());
  if (source.index) bare.setIndex(source.index.clone());
  const shell = mergeVertices(bare, 1e-4);
  shell.computeVertexNormals();
  bare.dispose();
  shells.set(source, shell);
  return shell;
}

/** Outlines every visible mesh under `root`. Returns the function that removes the outline again. */
export function addOutline(root: Object3D): () => void {
  const added: Mesh[] = [];
  const targets: Mesh[] = [];
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || (node as InstancedMesh).isInstancedMesh || node.userData.outline || !node.visible) return;
    targets.push(mesh);
  });
  for (const mesh of targets) {
    const shell = new Mesh(shellOf(mesh.geometry), OUTLINE);
    shell.userData.outline = true;
    // Never a pick target itself, and never part of a bake or a shadow.
    shell.raycast = () => undefined;
    mesh.add(shell);
    added.push(shell);
  }
  return () => {
    for (const shell of added) shell.parent?.remove(shell);
  };
}
