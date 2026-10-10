"""Publish only the approved lid/piston assets. Author sergio.pulido@alodai.com."""
from pathlib import Path
import json,struct,subprocess,tempfile,shutil
from PIL import Image
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent;CLI='/tmp/rivetrun-meshopt-runtime/node_modules/.bin/gltf-transform';case=ROOT/'apps/web/public/models/parts/waterproof_case_hammond_1554j2gy.glb';piston=ROOT/'apps/web/public/models/mk2/piston_jump.glb'
def read(path):
 b=path.read_bytes();return b,json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
with tempfile.TemporaryDirectory(prefix='rr-lid-piston-') as temp:
 for source,dest in [(case,case),(Path('/tmp/piston_jump_plain.glb'),piston)]:
  b,d=read(source)
  if 'EXT_meshopt_compression' not in d.get('extensionsUsed',[]):
   target=Path(temp)/dest.name;subprocess.run([CLI,'meshopt',str(source),str(target),'--level','high'],check=True,capture_output=True);shutil.copy2(target,dest)
  elif source!=dest:shutil.copy2(source,dest)
b,d=read(case);assert len(b)<250000 and any(m.get('alphaMode')=='BLEND' for m in d['materials']);assert 'KHR_materials_transmission' not in d.get('extensionsUsed',[])
p=ROOT/'docs/inputs/component-models.json';entries=json.loads(p.read_text());entry=next(e for e in entries if e['key']=='waterproof_case_hammond_1554j2gy');entry.update(compression='meshopt',glbKb=round(len(b)/1000,3),tris=sum(d['accessors'][q['indices']]['count']//3 for mesh in d['meshes'] for q in mesh['primitives']));p.write_text(json.dumps(entries,indent=2)+'\n')
png=ROOT/'apps/web/public/renders/parts/waterproof_case_hammond_1554j2gy.png';shutil.copy2(png,HERE/'waterproof_case_lid_master.png');im=Image.open(png).convert('RGBA')
if png.stat().st_size>300000:im.quantize(colors=256,method=Image.Quantize.FASTOCTREE).save(png,optimize=True)
assert png.stat().st_size<=300000 and im.size==(1024,1024)
b,d=read(piston);primitives=[q for m in d['meshes'] for q in m['primitives']];assert len(b)<30000 and len(primitives)<=6 and 'EXT_meshopt_compression' in d['extensionsUsed'];foot=next(n for n in d['nodes'] if n['name']=='jump_piston_foot');assert abs(foot['translation'][1]-.225)<.001;assert d['nodes'][d['scenes'][0]['nodes'][0]].get('scale',[1,1,1])==[1,1,1]
p=piston.parent/'manifest.json';manifest=json.loads(p.read_text());entry=manifest['modules']['piston_jump'];entry.update(bytes=len(b),triangles=sum(d['accessors'][q['indices']]['count']//3 for q in primitives),meshes=len(primitives));p.write_text(json.dumps(manifest,indent=2)+'\n');print('PASS case GLB:',case.stat().st_size,'PNG:',png.stat().st_size,'piston:',len(b),'bytes /',entry['triangles'],'triangles, proper animation pivot.')
