"""Default all_rounder hero from the game GLBs. Author: sergio.pulido@alodai.com."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];MODELS=ROOT/'apps/web/public/models/mk2'
OUT=ROOT/'apps/web/public/renders/mk2';OUT.mkdir(parents=True,exist_ok=True)
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene;scene.unit_settings.scale_length=1
manifest=json.loads((MODELS/'manifest.json').read_text())
keys=['chassis','controller','offroad_wheels','motor_torque','battery_large','camera','ultrasonic','bumper']
for key in keys:
 bpy.ops.import_scene.gltf(filepath=str(MODELS/manifest['modules'][key]['file']))
 root=bpy.data.objects['module_'+key]
 if key!='offroad_wheels':root.location.z=manifest['deckOffsetY']['offroad_wheels']
bpy.context.view_layer.update()
objects=[o for o in scene.objects if o.type=='MESH']
points=[o.matrix_world@Vector(c) for o in objects for c in o.bound_box]
centre=Vector(tuple((min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)))
cd=bpy.data.cameras.new('hero_camera');cam=bpy.data.objects.new('hero_camera',cd);scene.collection.objects.link(cam)
cam.location=centre+Vector((3.2,-4.4,2.8));cam.rotation_euler=(centre-cam.location).to_track_quat('-Z','Y').to_euler();scene.camera=cam;cd.type='ORTHO';bpy.context.view_layer.update()
view=cam.matrix_world.inverted();p=[view@p for p in points];cd.ortho_scale=max(max(q[0] for q in p)-min(q[0] for q in p),(max(q[1] for q in p)-min(q[1] for q in p))*1920/1080)/.82
world=bpy.data.worlds.new('hero_studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[1].default_value=.1;scene.world=world
for name,p,power,color in [('key',(3,-3,5),220,(1,.9,.8)),('rim',(-3,3,3.5),260,(.65,.8,1)),('fill',(3,3,2),100,(1,1,1))]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=3.5;data.color=color;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=centre+Vector(p);o.rotation_euler=(centre-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True;scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(OUT/'default_build_hero.png');scene.view_settings.view_transform='AgX'
scene['author']='sergio.pulido@alodai.com';scene['preset']='all_rounder';scene['source']='Exact demo GLBs from models/mk2, including deckOffsetY.'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/blender/parts/default_build_hero.blend'))
bpy.ops.render.render(write_still=True)
