"""Validate M9 delivery budgets, axes and base origins. Author: sergio.pulido@alodai.com."""
import json,math,re,struct,sys
from pathlib import Path
from PIL import Image
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3];OUT=ROOT/'apps/web/public/env/m9'
manifest=json.loads((ROOT/'docs/inputs/m9-env.json').read_text())
assert len(manifest['layers'])==3
for layer in manifest['layers']:
 path=OUT/layer['file'];assert path.stat().st_size==layer['sizeBytes']<=600000
 with Image.open(path) as image:
  assert image.size==(4096,1024) and image.convert('RGBA').getchannel('A').getextrema()==(0,255)
 assert layer['horizonFromTop']==.4 and layer['cameraDepressionDegrees']==15
print('PASS three transparent 4096×1024 parallax layers, each ≤600 KB.')
if '--layers-only' in sys.argv:sys.exit(0)
expected={'snowdrift_01','snowdrift_02','snowdrift_03','antenna_mast'}
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
assert triangles<=30000 and size<=2000000
print('PASS',len(manifest['props']),'meshopt props:',triangles,'triangles;',size,'bytes; +Y up, metre bounds, origin at base-centre.')
