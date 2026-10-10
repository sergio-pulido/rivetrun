/** Decode only this environment's meshes locally. Author: sergio.pulido@alodai.com. */
import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';
const require=createRequire('/tmp/rivetrun-meshopt-runtime/package.json');const {NodeIO}=require('@gltf-transform/core');const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');const {MeshoptDecoder}=await import(pathToFileURL(require.resolve('meshoptimizer')));await MeshoptDecoder.ready;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');const manifest=JSON.parse(await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'candidate/m7-env.json'),'utf8'));const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
let count=0;
for(const item of manifest.props){
 const doc=await io.read(path.join(path.dirname(fileURLToPath(import.meta.url)),'candidate',item.file));
 for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
  const position=primitive.getAttribute('POSITION');const normal=primitive.getAttribute('NORMAL');if(!position||!normal)throw new Error(item.id+': missing positions/normals');
  for(const attribute of [position,normal])if(![...attribute.getArray()].every(Number.isFinite))throw new Error(item.id+': non-finite geometry');
  const indices=primitive.getIndices()?.getArray();if(indices&&![...indices].every(i=>i>=0&&i<position.getCount()))throw new Error(item.id+': broken index references');
  count++;
 }
 for(const texture of doc.getRoot().listTextures())if(!texture.getImage()?.length)throw new Error(item.id+': missing embedded texture');
}
console.log('PASS:',manifest.props.length,'M7 meshopt GLBs,',count,'decoded primitives; finite positions/normals, valid indices and embedded textures. No network decoder.');
