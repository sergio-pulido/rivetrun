"""Validate demo GLBs; no printing or slicing. Author: sergio.pulido@alodai.com."""
import json,struct,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'apps/web/public/models/mk2'
m=json.loads((OUT/'manifest.json').read_text());ids={p['id'] for p in json.loads((ROOT/'docs/inputs/printed-parts.json').read_text())};materials=set()
def mul(a,b):return [[sum(a[i][k]*b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]
def matrix(n):
 if "matrix" in n:return [[n["matrix"][j*4+i] for j in range(4)] for i in range(4)]
 x,y,z,w=n.get("rotation",[0,0,0,1]);v=n.get("scale",[1,1,1]);t=n.get("translation",[0,0,0])
 a=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),t[0]],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),t[1]],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),t[2]],[0,0,0,1]]
 for i in range(3):
  for k in range(3):a[i][k]*=v[k]
 return a
def mesh_bounds(j):
 points=[]
 def visit(id,parent):
  node=j["nodes"][id];world=mul(parent,matrix(node))
  if "mesh" in node:
   for p in j["meshes"][node["mesh"]]["primitives"]:
    bounds=j["accessors"][p["attributes"]["POSITION"]]
    for x in [bounds["min"][0],bounds["max"][0]]:
     for y in [bounds["min"][1],bounds["max"][1]]:
      for z in [bounds["min"][2],bounds["max"][2]]:points.append([sum(world[i][k]*[x,y,z,1][k] for k in range(4)) for i in range(3)])
  for child in node.get("children",[]):visit(child,world)
 for root in j["scenes"][j.get("scene",0)]["nodes"]:visit(root,[[int(i==k) for k in range(4)] for i in range(4)])
 return [[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
for key,entry in m['modules'].items():
 b=(OUT/entry['file']).read_bytes();magic,version,n=struct.unpack_from('<4sII',b);assert magic==b'glTF' and version==2 and n==len(b)
 size=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+size]);names=[o['name'] for o in j['nodes']]
 assert all(re.fullmatch('[a-z0-9_]+',s) for s in names)
 roots=j['scenes'][j.get('scene',0)]['nodes'];assert len(roots)==1 and j['nodes'][roots[0]]['name']=='module_'+key
 assert not j.get('extensionsRequired') and not j.get('extensionsUsed')
 assert not any(k in j for k in ['cameras','animations'])
 assert not any('uri' in o for k in ['buffers','images'] for o in j.get(k,[]))
 printed={s[6:].split('__')[0] for s in names if s.startswith('print_')};assert printed==set(entry['printedParts']) and printed<=ids
 p=[p for mesh in j.get('meshes',[]) for p in mesh['primitives']];tri=sum(j['accessors'][o['indices']]['count']//3 for o in p)
 bounds=mesh_bounds(j);assert all(max(abs(v) for v in b)<3 for b in bounds),(key,'assembly scale',bounds)
 assert tri==entry['triangles'] and len(p)==entry['meshes'] and len(b)==entry['bytes']
 assert tri<=(8000 if entry['slot']=='locomotion' else 2500) and len(b)<=400000
 if entry['slot']!='locomotion':assert len(p)<=6
 materials.update(o['name'] for o in j['materials'])
 for node in j['nodes']:
  if node['name'].startswith('wheel_'):assert 'mesh' not in node and node.get('children')
 print(key,tri,len(p),len(b))
assert len(materials)<=8,materials
for loco in ['wheels','offroad_wheels','tracks']:
 keys=['chassis','controller',loco,'motor_torque','battery_large','camera','ultrasonic']
 if loco=='offroad_wheels' and 'bumper' in m['modules']:keys.append('bumper')
 total={k:sum(m['modules'][id][k] for id in keys) for k in ['triangles','meshes','bytes']}
 assert total['triangles']<=18000 and total['meshes']<=36 and total['bytes']<=900000,(loco,total)
 print('ASSEMBLY',loco,total)
print('PASS. Physical fit and mobile FPS are not validated.')
