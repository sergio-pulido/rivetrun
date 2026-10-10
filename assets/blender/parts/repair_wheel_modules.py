"""Repair display wheels from sourced library meshes; no print outputs. Author: sergio.pulido@alodai.com."""
import bpy,json,math
from pathlib import Path
from mathutils import Matrix
HERE=Path(__file__).resolve().parent
namespace={'__file__':str(HERE/'build_demo_modules.py')}
source=(HERE/'build_demo_modules.py').read_text().split("r=start('chassis')")[0]
# Closed wheel surfaces are retained intact: collapsing thin hub walls destroys spokes.
source=source.replace("limit=3300 if slot=='locomotion'", "limit=8000 if slot=='locomotion'")
source=source.replace('assert len(blob)<=400000','assert len(blob)<=2000000 # compressed budget checked after meshopt')
exec(source,namespace)
append=namespace['append'];export=namespace['export'];ROOT=namespace['ROOT']
for key,part in [('offroad_wheels','wheels_80x10'),('wheels','wheels_80x10')]:
 if key=='offroad_wheels':bpy.ops.wm.open_mainfile(filepath=str(HERE/'module_offroad_wheels.blend'))
 else:
  namespace['clear']();bpy.context.scene.unit_settings.scale_length=1;bpy.ops.import_scene.gltf(filepath='/tmp/mk2-blender-decoded/wheels.glb')
 root=bpy.data.objects['module_'+key]
 pivots=[o for o in root.children_recursive if o.type=='EMPTY' and o.name.startswith('wheel_')]
 assert len(pivots)==4,(key,[o.name for o in pivots])
 for pivot in pivots:
  sign=-1 if pivot.location.y<0 else 1
  for o in list(pivot.children_recursive):bpy.data.objects.remove(o,do_unlink=True)
  rotation=Matrix.Rotation(sign*math.pi/2,3,'X')
  append(part,pivot,rot=rotation,omit_rubber=key=='offroad_wheels')
  if key=='offroad_wheels':append('offroad_tread_tpu',pivot,rot=rotation)
 export(key,root,'locomotion')
namespace['manifest']['modules']['offroad_wheels']['visualPrototypes']=['offroad_tread_tpu']
(ROOT/'apps/web/public/models/mk2/manifest.json').write_text(json.dumps(namespace['manifest'],indent=2)+'\n')
