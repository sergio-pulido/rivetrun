"""Validate closed wheel surfaces before export. Author: sergio.pulido@alodai.com."""
import bpy,bmesh,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
entries={p['key']:p for p in json.loads((ROOT/'docs/inputs/component-models.json').read_text())}
for key in ['wheels_60x8','wheels_80x10','wheels_90x10','offroad_tread_tpu']:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/entries[key]['blend']))
 root=bpy.data.objects['part_'+key]
 for o in root.children_recursive:
  if o.type!='MESH':continue
  bm=bmesh.new();bm.from_mesh(o.data)
  assert all(e.is_manifold for e in bm.edges),(key,o.name,'open or non-manifold edges')
  assert all(f.calc_area()>1e-12 for f in bm.faces),(key,o.name,'collapsed face')
  assert bm.calc_volume(signed=True)>0,(key,o.name,'inverted normals')
  bm.free()
 print('PASS closed outward wheel surfaces:',key,flush=True)
