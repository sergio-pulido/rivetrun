/** Validate only the requested case/piston geometry and motion contract. */
import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');const require=createRequire('/tmp/rivetrun-meshopt-runtime/package.json');const {NodeIO,getBounds}=require('@gltf-transform/core');const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');const {MeshoptDecoder}=await import(pathToFileURL(require.resolve('meshoptimizer')));await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
for(const [file,budget] of [['apps/web/public/models/parts/waterproof_case_hammond_1554j2gy.glb',250000],['apps/web/public/models/mk2/piston_jump.glb',30000]]){
 const location=path.join(root,file);if((await fs.stat(location)).size>budget)throw new Error(file+' over budget');const doc=await io.read(location);const extensions=doc.getRoot().listExtensionsUsed().map(e=>e.extensionName);if(!extensions.includes('EXT_meshopt_compression')||extensions.includes('KHR_draco_mesh_compression'))throw new Error('Wrong compression');
 for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
  const pos=primitive.getAttribute('POSITION');const normal=primitive.getAttribute('NORMAL');if(!pos||!normal)throw new Error('Missing geometry attribute');for(const a of [pos,normal])if(![...a.getArray()].every(Number.isFinite))throw new Error('Non-finite geometry');if(![...primitive.getIndices().getArray()].every(i=>i>=0&&i<pos.getCount()))throw new Error('Invalid indices');
 }
 const scene=doc.getRoot().listScenes()[0];const bounds=getBounds(scene);
 if(file.includes('/parts/')){
  if(Math.abs(bounds.max[0]-bounds.min[0]-.16)>.001||Math.abs(bounds.max[1]-bounds.min[1]-.061)>.001||Math.abs(bounds.max[2]-bounds.min[2]-.089)>.001)throw new Error('Case envelope changed');const lid=doc.getRoot().listMaterials().find(m=>m.getName()==='frosted_polycarbonate');if(!lid||lid.getAlphaMode()!=='BLEND'||lid.getAlpha()>.06)throw new Error('Lid must reveal electronics');if(!doc.getRoot().listMaterials().some(m=>m.getName()==='orange_gasket'))throw new Error('Missing gasket');
 }else{
  const node=doc.getRoot().listNodes().find(n=>n.getName()==='module_piston_jump');const foot=doc.getRoot().listNodes().find(n=>n.getName()==='jump_piston_foot');if(!node||!foot||node.getScale().some(v=>Math.abs(v-1)>1e-6))throw new Error('Wrong root/foot scale');const rest=foot.getTranslation();if(bounds.min[1]-.205<-.001)throw new Error('Retracted foot under ground on tracks');foot.setTranslation([rest[0],rest[1]-.3,rest[2]]);const moved=getBounds(scene);if(Math.abs(moved.min[1]-bounds.min[1]+.3)>.002)throw new Error('Game foot stroke incorrectly scaled');console.log('PASS full 0.3-unit foot travel and tracks ground clearance.');
 }
 console.log('PASS',file,'meshopt decode, finite normals/positions, indices and budget.');
}
