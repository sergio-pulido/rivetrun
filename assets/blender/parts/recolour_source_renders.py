"""Update Blender source materials and component renders. Author: sergio.pulido@alodai.com."""
import bpy,json,re,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from apply_demo_palette import PALETTE,ROOT
entries=json.loads((ROOT/'docs/inputs/component-models.json').read_text())
paths={ROOT/p['blend'] for p in entries}|set(HERE.glob('module_*.blend'))
for path in sorted(paths) if '--renders-only' not in sys.argv else []:
 bpy.ops.wm.open_mainfile(filepath=str(path))
 for material in bpy.data.materials:
  name=re.sub(r'\.\d+$','',material.name)
  if name not in PALETTE:continue
  colour,metal,rough=PALETTE[name];material.use_nodes=True
  shader=material.node_tree.nodes.get('Principled BSDF')
  if shader:
   shader.inputs['Base Color'].default_value=(*colour,1);shader.inputs['Metallic'].default_value=metal;shader.inputs['Roughness'].default_value=rough
   material.diffuse_color=(*colour,1)
 for o in bpy.data.objects:
  if o.type=='MESH' and o.name.startswith('print_'):
   mat=bpy.data.materials.get('petg') or bpy.data.materials.new('petg');mat.use_nodes=True
   colour,metal,rough=PALETTE['petg'];shader=mat.node_tree.nodes.get('Principled BSDF')
   shader.inputs['Base Color'].default_value=(*colour,1);shader.inputs['Metallic'].default_value=metal;shader.inputs['Roughness'].default_value=rough
   o.data.materials.clear();o.data.materials.append(mat)
   for face in o.data.polygons:face.material_index=0
 bpy.ops.wm.save_as_mainfile(filepath=str(path))
namespace={'__file__':str(HERE/'create_library.py')}
exec((HERE/'create_library.py').read_text().split('keys=sys.argv')[0],namespace)
for p in entries if '--sources-only' not in sys.argv else []:
 key=p['key']
 if '--winch-only' in sys.argv and key!='winch_pololu_1000to1':continue
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/p['blend']))
 candidates=[o for o in bpy.data.objects if o.name.split('.')[0]=='part_'+key]
 if not candidates and key=='motor_298to1_hpcb_12v_ext':candidates=[o for o in bpy.data.objects if o.name.split('.')[0]=='part_motor_50to1_hpcb_12v_ext']
 assert candidates,('Missing component source root',key)
 root=candidates[0];namespace['root']=root
 visible={root,*root.children_recursive}
 for o in bpy.context.scene.objects:o.hide_render=o not in visible;o.hide_set(False)
 namespace['render'](key)
 print('PALETTE RENDER',key,flush=True)
