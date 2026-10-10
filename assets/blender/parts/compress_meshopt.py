"""Publish meshopt GLBs without changing scene/node ownership.
Author: sergio.pulido@alodai.com.
Install CLI outside the repo: npm install --prefix /tmp/rivetrun-meshopt-runtime @gltf-transform/cli
"""
import json,struct,subprocess,tempfile,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
CLI=os.environ.get('MK2_GLTF_TRANSFORM','/tmp/rivetrun-meshopt-runtime/node_modules/.bin/gltf-transform')
LIB=ROOT/'docs/inputs/component-models.json';ROVER=ROOT/'apps/web/public/models/mk2/manifest.json'
parts=json.loads(LIB.read_text());rover=json.loads(ROVER.read_text())
paths=[ROOT/p['glb'] for p in parts if p.get('glb')]+[ROVER.parent/p['file'] for p in rover['modules'].values()]
def document(path):
 b=path.read_bytes();return json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
def identity(j):return sorted((n.get('name',''),json.dumps(n.get('extras',{}),sort_keys=True)) for n in j['nodes'])
with tempfile.TemporaryDirectory(prefix='mk2-meshopt-') as folder:
 for index,path in enumerate(paths):
  before=document(path)
  if 'EXT_meshopt_compression' not in before.get('extensionsUsed',[]):
   out=Path(folder)/(str(index)+'.glb')
   result=subprocess.run([CLI,'meshopt',str(path),str(out),'--level','high'],capture_output=True,text=True)
   if result.returncode:raise RuntimeError(str(path)+'\n'+result.stderr+'\n'+result.stdout)
   after=document(out)
   assert identity(before)==identity(after),(path,'node names or metadata changed')
   assert 'EXT_meshopt_compression' in after.get('extensionsUsed',[]) and 'KHR_draco_mesh_compression' not in after.get('extensionsUsed',[])
   out.replace(path)
  print(path.name,path.stat().st_size,flush=True)
for p in parts:
 if p.get('glb'):
  path=ROOT/p['glb'];j=document(path);p['compression']='meshopt';p['glbKb']=round(path.stat().st_size/1000,3);p['tris']=sum(j['accessors'][q['indices']]['count']//3 for mesh in j['meshes'] for q in mesh['primitives'])
for p in rover['modules'].values():
 path=ROVER.parent/p['file'];j=document(path);p['compression']='meshopt';p['bytes']=path.stat().st_size;p['triangles']=sum(j['accessors'][q['indices']]['count']//3 for mesh in j['meshes'] for q in mesh['primitives']);p['meshes']=sum(len(mesh['primitives']) for mesh in j['meshes'])
rover['compression']='meshopt';rover['compressionOverride']='Human instruction: meshopt for all GLBs; supersedes plain module export requirement.'
LIB.write_text(json.dumps(parts,indent=2)+'\n');ROVER.write_text(json.dumps(rover,indent=2)+'\n')
