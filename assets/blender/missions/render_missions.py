"""Mission cards: unchanged neutral All-rounder, existing kits, simple terrain staging."""
import bpy,math,json,random,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent;rng=random.Random(1430)
CORE=['M7','M3','M6','M9'];BONUS=['M1','M2','M4','M5','M8'];missions=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else CORE
records=[]
def mat(name,c,rough=.8,metal=0,noise=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if noise:
  n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=12;n.inputs['Detail'].default_value=3;b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.35;b.inputs['Distance'].default_value=.055;m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal'])
  ramp=m.node_tree.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=tuple(v*.62 for v in c)+(1,);ramp.color_ramp.elements[1].color=tuple(v*1.23 for v in c)+(1,);m.node_tree.links.new(n.outputs['Fac'],ramp.inputs['Fac']);m.node_tree.links.new(ramp.outputs['Color'],p.inputs['Base Color'])
 return m

def box(name,p,s,material):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.scale=s;o.data.materials.append(material);return o

def patch(name,p,size,material):
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=1,depth=.012,location=p);o=bpy.context.object;o.name=name;o.scale=(size[0],size[1],1);o.data.materials.append(material);return o

def append_prop(mission,key,p,scale=1,rotation=0):
 source=ROOT/('assets/blender/env/m7/m7_props.blend' if mission=='M7' else 'assets/blender/env/m9/m9_environment.blend')
 with bpy.data.libraries.load(str(source),link=False) as (src,dst):dst.objects=src.objects
 objects=[o for o in dst.objects if o];name=mission.lower()+'_'+key;obj=next(o for o in objects if o.name==name or o.name.startswith(name+'.'));keep={obj,*obj.children_recursive}
 for o in objects:
  if o in keep:bpy.context.scene.collection.objects.link(o);o.hide_render=False;o.hide_set(False)
  else:bpy.data.objects.remove(o,do_unlink=True)
 obj.location=p;obj.scale=(scale,)*3;obj.rotation_euler.z=rotation
 return obj

def backdrop(path,cam,width=17,vertical=1.0,shift=-1.2):
 scene=bpy.context.scene;bpy.context.view_layer.update();height=width/4;m=bpy.data.materials.new('existing_kit_backdrop');m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;n.clear();out=n.new('ShaderNodeOutputMaterial');em=n.new('ShaderNodeEmission');image=n.new('ShaderNodeTexImage');image.image=bpy.data.images.load(str(path));em.inputs['Strength'].default_value=.55;l.new(image.outputs['Color'],em.inputs['Color']);l.new(em.outputs[0],out.inputs['Surface'])
 bpy.ops.mesh.primitive_plane_add(size=1);o=bpy.context.object;o.name='render_only_existing_kit_backdrop';o.scale=(width,height,1);o.matrix_world=cam.matrix_world.copy();o.location=cam.matrix_world@Vector((shift,vertical,-28));o.scale=(width,height,1);o.data.materials.append(m)

for mission in missions:
 for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
 for c in list(bpy.data.collections):
  if c.name!='Collection' and c.users==0:bpy.data.collections.remove(c)
 scene=bpy.context.scene;scene.unit_settings.scale_length=1
 with bpy.data.libraries.load(str(ROOT/'assets/blender/presets/preset_cards.blend'),link=False) as (src,dst):dst.collections=['all_rounder']
 col=dst.collections[0];scene.collection.children.link(col);col.hide_render=False
 robot=bpy.data.objects.new('neutral_all_rounder',None);scene.collection.objects.link(robot)
 for o in list(col.objects):
  o.hide_render=False;o.hide_set(False)
  if o.parent is None:o.parent=robot
 robot.location=(-1.45,-.5,-.07 if mission=='M3' else 0)
 terrain={
 'M7':(.13,.135,.14),'M3':(.10,.061,.029),'M6':(.16,.19,.18),'M9':(.6,.73,.87),
 'M1':(.11,.13,.145),'M2':(.47,.35,.19),'M4':(.13,.30,.43),'M5':(.11,.14,.15),'M8':(.10,.14,.16)}[mission]
 ground=mat('mission_ground',terrain,.97 if mission in ['M3','M9'] else .82,noise=True);mud=mat('deep_mud',(.038,.023,.011),.25,noise=True);water=mat('crossing_water',(.016,.10,.14),.13,.48,noise=True);concrete=mat('muted_concrete',(.22,.23,.23),noise=True);sand=mat('sand',(.47,.35,.19),noise=True);grass=mat('grass',(.06,.10,.045),noise=True)
 target=Vector((.35,0,.75));cd=bpy.data.cameras.new('shared_mission_camera');cam=bpy.data.objects.new(cd.name,cd);scene.collection.objects.link(cam);cam.location=target+Vector((1.6,-5.5,2.6))*2;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=7.6;scene.camera=cam
 world=bpy.data.worlds.new('shared_dusk_world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.085,.12,.17,1);world.node_tree.nodes['Background'].inputs[1].default_value=.05 if mission=='M9' else .5;scene.world=world
 # Same three-point rig and grade; night uses reduced ambient exposure and headlights.
 for name,p,power,colr,size in [('key',(-3,-5,7),1000,(.86,.93,1),5),('rim',(0,5,6),1300,(.70,.83,1),5),('fill',(5,-1,4),550,(1,.88,.72),4)]:
  d=bpy.data.lights.new(name,'AREA');d.energy=power*(.12 if mission=='M9' else 1);d.color=colr;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=p;o.rotation_euler=(Vector((0,0,.2))-o.location).to_track_quat('-Z','Y').to_euler()
 if mission in ['M7','M6']:
  # Actual empty span: two level edges, no launch ramp.
  left_edge=.45;right_edge=1.55 if mission=='M7' else 3.7
  box('left_bank',(-4,0,-.43),((left_edge+4)*2,9,.86),ground);box('right_bank',(right_edge+4,0,-.43),(8,9,.86),ground)
  if mission=='M7':
   box('deep_gap_floor',(1,0,-1.5),(1.1,9,.15),mat('gap_shadow',(.005,.008,.012)))
   backdrop(ROOT/'assets/blender/env/m7/parallax_preview.png',cam,17,.8,-1.8)
   for key,p,scale,rot in [('collapsed_wall',(2.7,2.0,0),.65,-.2),('rubble_pile_01',(-2.5,1.5,0),.7,.5),('slab_rebar',(-.2,1.5,0),.65,-.15),('rescue_beacon',(2.25,-1.1,0),1,0)]:append_prop('M7',key,p,scale,rot)
  else:
   box('deep_water',(2.075,0,-.15),(3.25,9,.12),water)
   for key,p,scale in [('cracked_slab_01',(3.7,1.5,-.05),.8),('rubble_pile_02',(-.1,2.0,0),.6),('slab_rebar',(2.5,1.8,-.28),.55)]:append_prop('M7',key,p,scale,.2)
 else:
  box('terrain',(0,0,-.25),(22,9 if mission=='M9' else 18,.5),ground)
  if mission=='M3':
   patch('deep_mud_basin',(-.8,-.5,.019),(2.05,1.10),mud)
   brown_water=mat('muddy_puddle',(.055,.044,.026),.20,.08)
   patch('mud_puddle',(1.65,-.15,.032),(1.65,1.2),brown_water)
   for y in [-1.08,.08]:box('deep_wheel_rut',(-1.3,y,.011),(5.2,.33,.028),mud)
   for key,p,scale in [('rubble_pile_01',(3,2.0,0),.45),('cracked_slab_02',(-2.7,1.7,0),.45)]:append_prop('M7',key,p,scale,.3)
  elif mission=='M9':
   backdrop(ROOT/'assets/blender/env/m9/parallax_preview.png',cam,17,1.1,-.4)
   for key,p,s in [('snowdrift_01',(2,1.0,0),1.2),('snowdrift_02',(-2.7,1.3,0),.8),('antenna_mast',(3.2,2,0),.42)]:append_prop('M9',key,p,s)
   for y in [-.2,.2]:
    d=bpy.data.lights.new('robot_headlight','SPOT');d.energy=110;d.color=(1,.92,.75);d.spot_size=.55;d.spot_blend=.65;d.shadow_soft_size=.08;o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);o.location=robot.location+Vector((.95,y,.40));o.rotation_euler=(Vector((4,y-.5,-.1))-o.location).to_track_quat('-Z','Y').to_euler()
   # Bounded atmospheric volume makes the two real spot-light beams legible.
   fog=bpy.data.materials.new('night_headlight_haze');fog.use_nodes=True;n=fog.node_tree.nodes;n.clear();out=n.new('ShaderNodeOutputMaterial');vol=n.new('ShaderNodeVolumePrincipled');vol.inputs['Density'].default_value=.002;vol.inputs['Color'].default_value=(.45,.56,.68,1);fog.node_tree.links.new(vol.outputs['Volume'],out.inputs['Volume']);box('render_only_headlight_haze',(2,-.4,1),(10,5,3),fog)
  elif mission=='M1':
   box('grass_verge',(2,2,.02),(8,2,.04),grass);box('small_step',(1.8,-.2,.11),(1.2,2.4,.22),concrete);append_prop('M7','crash_barrier',(3.2,2,0),.65)
  elif mission=='M2':
   patch('shallow_crossing',(2.1,-.1,.02),(2.5,1.4),water)
   drift=append_prop('M9','snowdrift_01',(2.1,2.7,0),1.3)
   for o in drift.children_recursive:
    if o.type=='MESH':o.data.materials.clear();o.data.materials.append(sand)
  elif mission=='M4':
   icy=mat('blue_ice',(.13,.30,.43),.16,.35,noise=True);box('ice_climb',(2,0,.09),(4,5,.16),icy).rotation_euler.y=-.09;append_prop('M7','rubble_pile_02',(2.5,1.6,.18),.6)
  elif mission=='M5':
   box('sand_segment',(1,0,.015),(1.2,7,.03),sand);box('grass_segment',(2.2,0,.015),(1.2,7,.03),grass);box('water_segment',(3.4,0,.02),(1.2,7,.03),water);append_prop('M7','crash_barrier',(3,2,0),.75)
  elif mission=='M8':
   patch('ridge_puddle',(1.1,-.1,.02),(1.3,.7),water);append_prop('M9','antenna_mast',(2.9,1.5,0),.42);append_prop('M7','rubble_pile_02',(1.9,1.6,0),.6)
 if mission in ['M5','M8']:
  rain=mat('rain_streak',(.25,.4,.55),.25)
  for i in range(30):
   o=box('rain', (rng.uniform(-4,4),rng.uniform(-2,3),rng.uniform(1,3)),(.007,.007,.24),rain);o.rotation_euler.y=-.35
 scene.render.engine='CYCLES';scene.cycles.samples=36;scene.cycles.use_denoising=True;scene.cycles.volume_bounces=1;scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.film_transparent=False;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB';scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.15;scene['author']='sergio.pulido@alodai.com';scene['mission']=mission;scene['robot']='Unchanged All-rounder MK-II; render-only headlights for M9.'
 for image in bpy.data.images:
  if image.source=='FILE' and not image.packed_file and not Path(bpy.path.abspath(image.filepath)).exists():
   matches=list((ROOT/'assets/blender/env').rglob(Path(image.filepath).name))
   if matches:image.filepath=str(matches[0])
 bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(HERE/(mission+'.blend')));scene.render.filepath=str(HERE/(mission+'.png'));bpy.ops.render.render(write_still=True);print('MISSION MASTER',mission,flush=True)
 records.append({'id':mission,'master':'assets/blender/missions/'+mission+'.png','source':'assets/blender/missions/'+mission+'.blend','robot':'all_rounder','cameraDirection':[1.6,-5.5,2.6],'orthoScale':7.6,'colourGrade':'AgX, exposure +0.15','chipQuietAreaPx':[0,0,180,72],'headlights':mission=='M9','nightLightMultiplier':.12 if mission=='M9' else 1,'reusedKit':'M7' if mission=='M7' else 'M9' if mission=='M9' else 'M7/M9 prop meshes as simple scenery','renderOnly':True})
old=json.loads((HERE/'masters.json').read_text()) if (HERE/'masters.json').exists() else [];ids={r['id'] for r in records};(HERE/'masters.json').write_text(json.dumps([r for r in old if r['id'] not in ids]+records,indent=2)+'\n')
