"""Source-only M9 kit overview, not a runtime texture. Author: sergio.pulido@alodai.com."""
import bpy,json
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(HERE/'m9_environment.blend'));scene=bpy.context.scene
keys=[p['id'] for p in json.loads((HERE/'prop_records.json').read_text())]
positions=[(-4,-1),(0,-1),(4,-1),(-2,3)]
for key in ['far_ice','mid_station','near_snow']:bpy.data.collections[key].hide_render=True
for key in keys:bpy.data.collections[key].hide_render=False
for o in list(scene.objects):
 if o.type in ['LIGHT','CAMERA']:bpy.data.objects.remove(o,do_unlink=True)
for key,(x,y) in zip(keys,positions):bpy.data.objects['m9_'+key].location=(x,y,0)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.02));floor=bpy.context.object;m=bpy.data.materials.new('review_floor');m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.09,.14,.21,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;floor.data.materials.append(m)
world=bpy.data.worlds.new('review_world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
for name,p,energy,size in [('key',(-6,-8,12),2500,8),('rim',(2,8,10),3000,7),('fill',(9,-4,8),1800,8)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=p;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
bpy.context.view_layer.update()
points=[o.matrix_world@Vector(c) for key in keys for o in bpy.data.objects['m9_'+key].children_recursive if o.type=='MESH' for c in o.bound_box]
centre=Vector(tuple((min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)))
d=bpy.data.cameras.new('prop_review_camera');cam=bpy.data.objects.new('prop_review_camera',d);scene.collection.objects.link(cam);cam.location=centre+Vector((8,-13,10));cam.rotation_euler=(centre-cam.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';scene.camera=cam
bpy.context.view_layer.update();view=cam.matrix_world.inverted();projected=[view@p for p in points]
d.ortho_scale=max(max(p[0] for p in projected)-min(p[0] for p in projected),(max(p[1] for p in projected)-min(p[1] for p in projected))*1920/1080)/.85

scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(HERE/'prop_preview.png');bpy.ops.render.render(write_still=True)
