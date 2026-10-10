"""Validate demo GLBs; no printing or slicing. Author: sergio.pulido@alodai.com."""
import json,struct,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'apps/web/public/models/mk2'
m=json.loads((OUT/'manifest.json').read_text());ids={p['id'] for p in json.loads((ROOT/'docs/inputs/printed-parts.json').read_text())};materials=set()
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
 total={k:sum(m['modules'][id][k] for id in keys) for k in ['triangles','meshes','bytes']}
 assert total['triangles']<=18000 and total['meshes']<=36 and total['bytes']<=900000,(loco,total)
 print('ASSEMBLY',loco,total)
print('PASS. Physical fit and mobile FPS are not validated.')
