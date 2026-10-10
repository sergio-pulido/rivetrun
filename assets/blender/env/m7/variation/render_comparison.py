"""Matched Blender comparison at 1280x720, using the unchanged game rover and supplied layers."""
import bpy,math,json
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[4]
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene
manifest=json.loads(Path('/tmp/mk2-blender-decoded/manifest.json').read_text())
for key in ['chassis','controller','offroad_wheels','motor_torque','battery_large','camera','ultrasonic','bumper']:
 bpy.ops.import_scene.gltf(filepath='/tmp/mk2-blender-decoded/'+manifest['modules'][key]['file']);o=bpy.data.objects['module_'+key];o.location.x=-1.4;o.location.y=-2.5
 if key!='offroad_wheels':o.location.z=manifest['deckOffsetY']['offroad_wheels']
cd=bpy.data.cameras.new('matched_game_side_camera');cam=bpy.data.objects.new(cd.name,cd);scene.collection.objects.link(cam);target=Vector((0,0,3.2));cam.location=target+Vector((0,-40,40*math.tan(math.radians(15))));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=18;scene.camera=cam
world=bpy.data.worlds.new('comparison_dusk');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.33,.4,.48,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
for name,p,power,col,size in [('soft_dusk_key',(-4,-6,9),1050,(.86,.92,1),7),('dust_fill',(5,-2,6),650,(1,.86,.68),5),('sky_rim',(0,6,10),1500,(.7,.82,1),6)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=col;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=p;o.rotation_euler=(Vector((0,0,.4))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.025));floor=bpy.context.object;floor.name='review_only_shadow_catcher';floor.is_shadow_catcher=True
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True;scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.2
scene['author']='sergio.pulido@alodai.com';scene['purpose']='Matched review, not a gameplay screenshot. Exact unchanged MK-II GLBs; same camera and lights in both images.'
for label,source in [('before',HERE.parent/'m7_props.blend'),('after',HERE/'m7_props.blend')]:
 with bpy.data.libraries.load(str(source),link=False) as (src,dst):dst.objects=src.objects
 imported=[o for o in dst.objects if o];roots={o.name:o for o in imported if o.type=='EMPTY'}
 choices={'m7_collapsed_wall':(5.2,3.5,0),'m7_rubble_pile_01':(-4.6,1.8,0),'m7_slab_rebar':(3.8,-.6,0),'m7_crash_barrier':(-6.4,3.3,0),'m7_rescue_beacon':(1.4,-1.4,0)}
 keep=set()
 for name,p in choices.items():
  obj=next(o for o in imported if o.type=='EMPTY' and (o.name==name or o.name.startswith(name+'.')));obj.location=p
  for child in [obj,*obj.children_recursive]:scene.collection.objects.link(child);keep.add(child)
 for o in imported:
  if o not in keep:bpy.data.objects.remove(o,do_unlink=True)
 scene.render.filepath=str(HERE/(label+'_foreground.png'));bpy.ops.render.render(write_still=True)
 if label=='after':bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'comparison_scene.blend'))
 for o in keep:bpy.data.objects.remove(o,do_unlink=True)
