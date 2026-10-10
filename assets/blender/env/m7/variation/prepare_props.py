"""Retain all prop geometry, paths and origins; mute the non-rover palette. Review only."""
import bpy,json
from pathlib import Path
HERE=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(HERE.parent/'m7_props.blend'))
for name,colour in {'m7_safety_orange':(.12,.135,.14),'m7_hazard_yellow':(.46,.36,.16),'m7_brick':(.19,.13,.095),'m7_rusted_rebar':(.12,.085,.055)}.items():
 material=bpy.data.materials.get(name)
 if material:material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*colour,1)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'m7_props.blend'))
manifest=json.loads((HERE.parents[4]/'docs/inputs/m7-env.json').read_text())
for item in manifest['props']:
 root=bpy.data.objects[item['root']];bpy.ops.object.select_all(action='DESELECT')
 for o in [root,*root.children_recursive]:o.select_set(True)
 bpy.context.view_layer.objects.active=root
 bpy.ops.export_scene.gltf(filepath=str(HERE/'candidate'/item['file']),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False,export_original_specular=False)
