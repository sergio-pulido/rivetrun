"""Consistent linear PBR palette in published GLBs; geometry/compression untouched.
Author: sergio.pulido@alodai.com. No print or fabrication outputs.
"""
import json,struct,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def linear(hex_colour):
 values=[int(hex_colour[i:i+2],16)/255 for i in (0,2,4)]
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)
PALETTE={
 'petg':(linear('FF7A1A'),0,.65),
 'pcb':(linear('07502B'),0,.65),
 'rubber':(linear('151719'),0,.94),
 'black_polymer':(linear('202326'),0,.78),
 'rubber_and_chip':(linear('151719'),0,.94),
 'steel':((.5,.55,.6),1,.3),
 'brass':((.56,.36,.095),.8,.3),
}
def publish_palette():
 lib_path=ROOT/'docs/inputs/component-models.json';module_path=ROOT/'apps/web/public/models/mk2/manifest.json'
 lib=json.loads(lib_path.read_text());modules=json.loads(module_path.read_text())
 paths=[ROOT/p['glb'] for p in lib if p.get('glb')]+[module_path.parent/p['file'] for p in modules['modules'].values()]
 for path in paths:
  data=path.read_bytes();size=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+size])
  for material in doc['materials']:
   name=re.sub(r'\.\d+$','',material.get('name',''))
   if name in PALETTE:
    colour,metal,rough=PALETTE[name];pbr=material.setdefault('pbrMetallicRoughness',{})
    pbr.update(baseColorFactor=[*colour,1],metallicFactor=metal,roughnessFactor=rough)
  printed_index=next((i for i,m in enumerate(doc['materials']) if m.get('name')=='petg'),None)
  for node in doc.get('nodes',[]):
   if not node.get('name','').startswith('print_') or 'mesh' not in node:continue
   if printed_index is None:
    colour,metal,rough=PALETTE['petg'];printed_index=len(doc['materials'])
    doc['materials'].append({'name':'petg','pbrMetallicRoughness':{'baseColorFactor':[*colour,1],'metallicFactor':metal,'roughnessFactor':rough}})
   for primitive in doc['meshes'][node['mesh']]['primitives']:primitive['material']=printed_index
  encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
  tail=data[20+size:];blob=struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(tail))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+tail
  path.write_bytes(blob)
 for p in lib:
  if p.get('glb'):p['glbKb']=round((ROOT/p['glb']).stat().st_size/1000,3)
 for p in modules['modules'].values():p['bytes']=(module_path.parent/p['file']).stat().st_size
 lib_path.write_text(json.dumps(lib,indent=2)+'\n');module_path.write_text(json.dumps(modules,indent=2)+'\n')
if __name__=='__main__':publish_palette()
