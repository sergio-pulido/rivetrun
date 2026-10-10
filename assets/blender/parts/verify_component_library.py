"""Check published BOM library, including deliberate render-only entries.
Author: sergio.pulido@alodai.com.
"""
import json,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
entries=json.loads((ROOT/'docs/inputs/component-models.json').read_text());keys={p['key'] for p in json.loads((ROOT/'docs/inputs/bom-mk2.json').read_text())['items']}
heavy={'wheels_60x8','wheels_80x10','wheels_90x10','offroad_tread_tpu','tracks_pololu_30t','scout_drone_crazyflie_21_plus','waterproof_case_hammond_1554j2gy','lidar_rplidar_c1'}
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
    if bounds.get('normalized'):
     divisor={5120:127,5121:255,5122:32767,5123:65535}[bounds['componentType']]
     bounds={**bounds,'min':[max(-1,v/divisor) for v in bounds['min']],'max':[max(-1,v/divisor) for v in bounds['max']]}
    for x in [bounds["min"][0],bounds["max"][0]]:
     for y in [bounds["min"][1],bounds["max"][1]]:
      for z in [bounds["min"][2],bounds["max"][2]]:points.append([sum(world[i][k]*[x,y,z,1][k] for k in range(4)) for i in range(3)])
  for child in node.get("children",[]):visit(child,world)
 for root in j["scenes"][j.get("scene",0)]["nodes"]:visit(root,[[int(i==k) for k in range(4)] for i in range(4)])
 return [[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]

count=0
assert len({p['key'] for p in entries})==len(entries)
for p in entries:
 key=p['key'];assert key in keys and (ROOT/p['blend']).is_file() and (ROOT/p['render']).is_file()
 assert p['dimsSource'] and isinstance(p['approximations'],list)
 if p.get('approximate'):
  assert p['glb'] is None and p['envelopeMm'] is None;continue
 path=ROOT/p['glb'];b=path.read_bytes();magic,ver,size=struct.unpack_from('<4sII',b);assert magic==b'glTF' and ver==2 and size==len(b)
 size=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+size]);roots=j['scenes'][j.get('scene',0)]['nodes'];assert len(roots)==1 and j['nodes'][roots[0]]['name']=='part_'+key
 assert 'EXT_meshopt_compression' in j.get('extensionsUsed',[]) and 'KHR_draco_mesh_compression' not in j.get('extensionsUsed',[])
 assert not any(k in j for k in ['cameras','animations'])
 assert not any('uri' in o for k in ['buffers','images'] for o in j.get(k,[]))
 primitives=[p for m in j.get('meshes',[]) for p in m['primitives']];tris=sum(j['accessors'][p['indices']]['count']//3 for p in primitives)
 assert tris==p['tris'] and tris<=(10000 if key in heavy else 5000)
 assert len(b)<=(250000 if key in heavy else 150000)
 assert abs(len(b)/1000-p['glbKb'])<.01
 bounds=mesh_bounds(j);assert all(max(abs(v) for v in b)<.5 for b in bounds),(key,'metre scale',bounds)
 count+=1
print('PASS:',count,'compressed BOM library GLBs;',len(entries)-count,'explicit render-only entries.')
