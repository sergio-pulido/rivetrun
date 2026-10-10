"""Package a complete candidate without touching the active environment."""
import json,struct,subprocess,tempfile,hashlib
from pathlib import Path
from PIL import Image
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[4];OUT=HERE/'candidate';LIVE=ROOT/'apps/web/public/env/m7';CLI='/tmp/rivetrun-meshopt-runtime/node_modules/.bin/gltf-transform'
m=json.loads((ROOT/'docs/inputs/m7-env.json').read_text())
for quality in [94,90,86,82,78,74,70,66,62]:
 for layer in m['layers']:
  image=Image.open(OUT/(layer['id']+'.png')).convert('RGBA');assert image.size==(4096,1024);assert image.getchannel('A').getextrema()==(0,255)
  image.save(OUT/layer['file'],'WEBP',quality=quality,method=6)
 total=sum((OUT/p['file']).stat().st_size for p in m['layers'])
 if total<=600000:break
assert total<=600000,total
for layer in m['layers']:layer['sizeBytes']=(OUT/layer['file']).stat().st_size
with tempfile.TemporaryDirectory(prefix='m7-variation-') as tmp:
 for item in m['props']:
  source=OUT/item['file'];target=Path(tmp)/source.name
  data=source.read_bytes();doc=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
  if 'EXT_meshopt_compression' not in doc.get('extensionsUsed',[]):
   subprocess.run([CLI,'meshopt',str(source),str(target),'--level','high'],check=True,capture_output=True);target.replace(source)
  data=source.read_bytes();doc=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
  item['sizeBytes']=len(data);item['triangles']=sum(doc['accessors'][p['indices']]['count']//3 for mesh in doc['meshes'] for p in mesh['primitives']);item['compression']='meshopt'
  assert 'EXT_meshopt_compression' in doc.get('extensionsUsed',[]) and 'KHR_draco_mesh_compression' not in doc.get('extensionsUsed',[])
triangles=sum(p['triangles'] for p in m['props']);size=sum(p['sizeBytes'] for p in m['props']);assert triangles<=15000 and size<=1200000
m['propTotals'].update(triangles=triangles,sizeBytes=size,triangleBudget=15000,byteBudget=1200000)
m['layerTotals'].update(sizeBytes=total,totalByteBudget=600000)
m['backdropNotes']='Irregular damaged skyline, leaning high-rise, bent tower crane and fractured overpass. Cool desaturated far haze, concrete/ochre middle distance, darker clustered foreground debris with abandoned car and fallen lamp. One restrained warm fire glow; no saturated orange.'
(OUT/'m7-env.json').write_text(json.dumps(m,indent=2)+'\n')
files=[p['file'] for p in [*m['layers'],*m['props']]]
report={'status':'complete_candidate_pending_Sergio_approval','author':'sergio.pulido@alodai.com','compression':'meshopt','webpQuality':quality,'layerBytes':total,'propBytes':size,'propTriangles':triangles,'files':files,'activeSha256':{p:hashlib.sha256((LIVE/p).read_bytes()).hexdigest() for p in files},'candidateSha256':{p:hashlib.sha256((OUT/p).read_bytes()).hexdigest() for p in files},'activeManifestSha256':hashlib.sha256((ROOT/'docs/inputs/m7-env.json').read_bytes()).hexdigest()}
(HERE/'review.json').write_text(json.dumps(report,indent=2)+'\n')
print('CANDIDATE:',total,'backdrop bytes;',size,'prop bytes;',triangles,'triangles; WebP quality',quality)
