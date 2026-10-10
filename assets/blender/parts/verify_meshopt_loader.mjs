/** Actual local Three.js decode, no CDN. Author: sergio.pulido@alodai.com. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const threePath=path.join(root,'apps/web/node_modules/three');
const {GLTFLoader}=await import(pathToFileURL(path.join(threePath,'examples/jsm/loaders/GLTFLoader.js')));
const {MeshoptDecoder}=await import(pathToFileURL(path.join(threePath,'examples/jsm/libs/meshopt_decoder.module.js')));
const {Box3,Vector3}=await import(pathToFileURL(path.join(threePath,'build/three.module.js')));
const parts=JSON.parse(await fs.readFile(path.join(root,'docs/inputs/component-models.json'),'utf8'));
const rover=JSON.parse(await fs.readFile(path.join(root,'apps/web/public/models/mk2/manifest.json'),'utf8'));
const files=[...parts.filter(p=>p.glb).map(p=>({id:p.key,file:p.glb,kind:'part',limit:.5})),...Object.entries(rover.modules).map(([id,p])=>({id,file:'apps/web/public/models/mk2/'+p.file,kind:'module',limit:3}))];
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);await MeshoptDecoder.ready;
const report=[];
for(const item of files){
 const bytes=await fs.readFile(path.join(root,item.file));
 const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 gltf.scene.updateMatrixWorld(true);const box=new Box3().setFromObject(gltf.scene);const size=box.getSize(new Vector3());
 if(box.isEmpty() || [...box.min.toArray(),...box.max.toArray()].some(v=>!Number.isFinite(v)||Math.abs(v)>item.limit))throw Error(item.id+' invalid decoded bounds');
 let triangles=0,meshes=0;gltf.scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
 report.push({...item,bytes:bytes.length,triangles,meshes,decodedSize:size.toArray(),offlineDecoder:true});
}
await fs.writeFile(path.join(root,'assets/blender/parts/meshopt-validation.json'),JSON.stringify({author:'sergio.pulido@alodai.com',decoder:'three.js bundled MeshoptDecoder',networkRequests:0,assets:report},null,2)+'\n');
console.log('PASS: '+report.length+' GLBs decoded with the bundled Three.js meshopt decoder; no CDN.');
