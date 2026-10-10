/** Temporary plain GLBs for Blender renders only. Author: sergio.pulido@alodai.com. */
import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';
const require=createRequire('/tmp/rivetrun-meshopt-runtime/package.json');
const {NodeIO}=require('@gltf-transform/core');const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');const {dequantize}=require('@gltf-transform/functions');
const {MeshoptDecoder}=await import(pathToFileURL(require.resolve('meshoptimizer')));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');const output=process.argv[2]??'/tmp/mk2-blender-decoded';await fs.mkdir(output,{recursive:true});
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});await MeshoptDecoder.ready;
const manifest=JSON.parse(await fs.readFile(path.join(root,'apps/web/public/models/mk2/manifest.json'),'utf8'));
for(const entry of Object.values(manifest.modules)){
 const doc=await io.read(path.join(root,'apps/web/public/models/mk2',entry.file));
 for(const ext of doc.getRoot().listExtensionsUsed())if(ext.extensionName==='EXT_meshopt_compression')ext.dispose();
 await doc.transform(dequantize());await io.write(path.join(output,entry.file),doc);
}
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Decoded temporary render inputs:',output);
