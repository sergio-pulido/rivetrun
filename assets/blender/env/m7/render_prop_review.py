"""Source-only M7 kit overview, not a runtime texture. Author: sergio.pulido@alodai.com."""
import bpy,json
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(HERE/'m7_props.blend'));scene=bpy.context.scene
keys=[p['id'] for p in json.loads((HERE/'prop_records.json').read_text())]
positions=[(-6,-4),(-2,-4),(2,-4),(6,-4),(-6,0),(-2,0),(2,0),(6,0),(-5,4),(0,4),(5,4)]
for key,(x,y) in zip(keys,positions):bpy.data.objects['m7_'+key].location=(x,y,0)
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;m=bpy.data.materials.new('review_floor');m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.25,.27,.3,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;floor.data.materials.append(m)
world=bpy.data.worlds.new('review_world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
for name,p,energy,size in [('key',(-6,-8,12),2500,8),('rim',(2,8,10),3000,7),('fill',(9,-4,8),1800,8)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=p;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('prop_review_camera');cam=bpy.data.objects.new('prop_review_camera',d);scene.collection.objects.link(cam);cam.location=(11,-18,16);cam.rotation_euler=(Vector((0,0,.5))-cam.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=22;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(HERE/'prop_preview.png');bpy.ops.render.render(write_still=True)
