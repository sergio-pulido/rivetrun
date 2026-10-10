"""Validate M7 delivery budgets, axes and base origins. Author: sergio.pulido@alodai.com."""
import json,math,re,struct,sys
from pathlib import Path
from PIL import Image
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[4];OUT=HERE/'candidate'
manifest=json.loads((OUT/'m7-env.json').read_text());baseline=json.loads((ROOT/'docs/inputs/m7-env.json').read_text())
assert [(p['id'],p['file'],p['url']) for p in manifest['layers']]==[(p['id'],p['file'],p['url']) for p in baseline['layers']]
assert [(p['id'],p['file'],p['root'],p['envelopeM']) for p in manifest['props']]==[(p['id'],p['file'],p['root'],p['envelopeM']) for p in baseline['props']]
assert len(manifest['layers'])==3
for layer in manifest['layers']:
 path=OUT/layer['file'];assert path.stat().st_size==layer['sizeBytes']<=600000
 with Image.open(path) as image:
  assert image.size==(4096,1024) and image.convert('RGBA').getchannel('A').getextrema()==(0,255)
 assert layer['horizonFromTop']==.4 and layer['cameraDepressionDegrees']==15
assert sum(p['sizeBytes'] for p in manifest['layers'])<=600000
print('PASS three transparent 4096×1024 layers, ≤600 KB together; runtime filenames, IDs and envelopes unchanged.')
if '--layers-only' in sys.argv:sys.exit(0)
expected={'cracked_slab_01','cracked_slab_02','cracked_slab_03','slab_rebar','rubble_pile_01','rubble_pile_02','collapsed_wall','crash_barrier','warning_tape_posts','emergency_tripod_light','rescue_beacon'}
assert {p['id'] for p in manifest['props']}==expected

def multiply(a,b):return [[sum(a[i][k]*b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]
def transform(node):
 if 'matrix' in node:return [[node['matrix'][j*4+i] for j in range(4)] for i in range(4)]
 x,y,z,w=node.get('rotation',[0,0,0,1]);s=node.get('scale',[1,1,1]);t=node.get('translation',[0,0,0])
 m=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),t[0]],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),t[1]],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),t[2]],[0,0,0,1]]
 for i in range(3):
  for k in range(3):m[i][k]*=s[k]
 return m

def bounds(doc):
 points=[]
 def visit(index,parent):
  node=doc['nodes'][index];world=multiply(parent,transform(node))
  if 'mesh' in node:
   for primitive in doc['meshes'][node['mesh']]['primitives']:
    accessor=doc['accessors'][primitive['attributes']['POSITION']];lo=accessor['min'];hi=accessor['max']
    if accessor.get('normalized'):
     divisor={5120:127,5121:255,5122:32767,5123:65535}[accessor['componentType']];lo=[max(-1,v/divisor) for v in lo];hi=[max(-1,v/divisor) for v in hi]
    for x in [lo[0],hi[0]]:
     for y in [lo[1],hi[1]]:
      for z in [lo[2],hi[2]]:points.append([sum(world[i][k]*[x,y,z,1][k] for k in range(4)) for i in range(3)])
  for child in node.get('children',[]):visit(child,world)
 for index in doc['scenes'][doc.get('scene',0)]['nodes']:visit(index,[[int(i==k) for k in range(4)] for i in range(4)])
 return [[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]

for entry in manifest['props']:
 path=OUT/entry['file'];data=path.read_bytes();magic,version,total=struct.unpack_from('<4sII',data);assert magic==b'glTF' and version==2 and total==len(data)==entry['sizeBytes']
 doc=json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])
 assert 'EXT_meshopt_compression' in doc.get('extensionsUsed',[]) and 'KHR_draco_mesh_compression' not in doc.get('extensionsUsed',[])
 assert not any(k in doc for k in ['cameras','animations'])
 assert not any('uri' in item for field in ['buffers','images'] for item in doc.get(field,[]))
 roots=doc['scenes'][doc.get('scene',0)]['nodes'];assert len(roots)==1 and doc['nodes'][roots[0]]['name']==entry['root']
 assert all(re.fullmatch('[a-z0-9_]+',node['name']) for node in doc['nodes'])
 triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives']);assert triangles==entry['triangles']
 box=bounds(doc);assert abs(box[1][0])<.003,(entry['id'],'base origin Y',box)
 assert abs(sum(box[0])/2)<.003 and abs(sum(box[2])/2)<.003,(entry['id'],'centred footprint',box)
 assert all(math.isfinite(v) and abs(v)<10 for pair in box for v in pair),(entry['id'],'metre dimensions',box)
 assert all(abs(box[i][1]-box[i][0]-entry['envelopeM'][i])<.01 for i in range(3)),(entry['id'],'envelope',box)
 assert entry['upAxis']=='+Y' and entry['units']=='metres' and entry['suggestedScale']==1
triangles=sum(p['triangles'] for p in manifest['props']);size=sum(p['sizeBytes'] for p in manifest['props'])
assert triangles<=15000 and size<=1200000
print('PASS',len(manifest['props']),'meshopt props:',triangles,'triangles;',size,'bytes; +Y up, metre bounds, origin at base-centre.')

review=json.loads((HERE/"review.json").read_text())
import hashlib
expected=review["candidateSha256"] if review["status"]=="approved_and_applied" else review["activeSha256"]
for file,sha in expected.items():assert hashlib.sha256((ROOT/"apps/web/public/env/m7"/file).read_bytes()).hexdigest()==sha
assert hashlib.sha256((ROOT/"docs/inputs/m7-env.json").read_bytes()).hexdigest()==review.get("publishedManifestSha256",review["activeManifestSha256"])
print("PASS active delivery matches the approved complete set." if review["status"]=="approved_and_applied" else "PASS active delivery unchanged; candidate awaits Sergio.")
