"""Four exact preset cards, common studio, camera and scale. Author sergio.pulido@alodai.com."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent;data=json.loads((HERE/'render-inputs.json').read_text())
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene;groups={};records=[]
def bounds(objects):
 bpy.context.view_layer.update();points=[o.matrix_world@Vector(c) for o in objects if o.type=='MESH' for c in o.bound_box];return [min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)]
for preset in data['presets']:
 col=bpy.data.collections.new(preset['id']);scene.collection.children.link(col);groups[preset['id']]=col;modules={};all_meshes=[];lift=data['deckOffsetY'].get(preset['build']['locomotion'],0)
 for key in preset['renderedParts']:
  previous=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=data['models'][key]['file']);imported=set(bpy.data.objects)-previous;roots=[o for o in imported if o.parent not in imported];group=bpy.data.objects.new(preset['id']+'__'+key,None);col.objects.link(group)
  for obj in roots:obj.parent=group
  group.scale=(data['models'][key]['scale'],)*3
  if key!=preset['build']['locomotion']:group.location.z=lift
  for obj in imported:
   for c in list(obj.users_collection):c.objects.unlink(obj)
   col.objects.link(obj)
  modules[key]=(group,list(imported));all_meshes.extend(o for o in imported if o.type=='MESH')
 if 'waterproof_case' in modules:
  chassis_lo,chassis_hi=bounds(modules['chassis'][1]);group,objects=modules['waterproof_case'];lo,hi=bounds(objects);group.location.z+=chassis_hi[2]+.01-lo[2];height=hi[2]-lo[2]
  # Keep the existing controller inside the closed purchased enclosure, not poking through its lid.
  _,case_hi=bounds(objects);controller,controller_objects=modules['controller'];_,controller_hi=bounds(controller_objects);controller.location.z+=min(0,case_hi[2]-.025-controller_hi[2])
  for sensor in preset['build']['sensors']:
   if sensor not in modules:continue
   if sensor=='imu':
    obj,meshes=modules[sensor];lo,hi=bounds(meshes);obj.location.x=-.25;obj.location.y=.16;obj.location.z+=chassis_hi[2]+.03-lo[2]
   else:modules[sensor][0].location.z+=height
 lo,hi=bounds(all_meshes);records.append({'id':preset['id'],'bounds':[lo,hi],'renderedParts':preset['renderedParts'],'missingParts':preset['missingParts']})
 for c in groups.values():c.hide_render=True
# Same camera direction as default_build_hero_side_3q; a common centre and orthographic scale for every card.
lo=[min(r['bounds'][0][i] for r in records) for i in range(3)];hi=[max(r['bounds'][1][i] for r in records) for i in range(3)];centre=Vector(tuple((lo[i]+hi[i])/2 for i in range(3)))
cd=bpy.data.cameras.new('preset_shared_camera');cam=bpy.data.objects.new(cd.name,cd);scene.collection.objects.link(cam);cam.location=centre+Vector((1.6,-5.5,2.6));cam.rotation_euler=(centre-cam.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';scene.camera=cam;bpy.context.view_layer.update();view=cam.matrix_world.inverted();points=[view@Vector((x,y,z)) for x in [lo[0],hi[0]] for y in [lo[1],hi[1]] for z in [lo[2],hi[2]]];cd.ortho_scale=max(max(p[i] for p in points)-min(p[i] for p in points) for i in [0,1])/.83
world=bpy.data.worlds.new('shared_bright_studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=world
for name,p,power in [('key',(3,-3,5),900),('rim',(-3,3,3.5),1200),('fill',(3,3,2),450)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=3.5;d.color=(1,1,1);o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=centre+Vector(p);o.rotation_euler=(centre-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True;scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='AgX';scene['author']='sergio.pulido@alodai.com';scene['presetSource']=data['presetSource'];scene['sameScale']=True
for c in groups.values():c.hide_render=False
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'preset_cards.blend'))
(HERE/'assembly-manifest.json').write_text(json.dumps({'author':data['author'],'records':records,'cameraDirection':[1.6,-5.5,2.6],'cameraTarget':list(centre),'orthoScale':cd.ortho_scale,'lights':'Exact default hero studio rig: white key/rim/fill 900/1200/450 W, 3.5 m area lights','sameCameraAndScale':True,'libraryPlacements':data['libraryPlacement'],'missingPartsPolicy':data['missingPartsPolicy']},indent=2)+'\n')
for preset in data['presets']:
 for key,c in groups.items():c.hide_render=key!=preset['id']
 scene.render.filepath=str(HERE/(preset['id']+'.png'));bpy.ops.render.render(write_still=True);print('PRESET MASTER',preset['id'],flush=True)
