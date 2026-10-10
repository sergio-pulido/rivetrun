"""Phone-readable Lab Missions grid sprites. Author: sergio.pulido@alodai.com.
Original generic props, no logos. Rover views use the published MK-II meshes.
"""
import bpy,math,json,random,os
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
OUT=ROOT/'apps/web/public/renders/lab';OUT.mkdir(parents=True,exist_ok=True)
MODELS=Path(os.environ.get('MK2_LAB_MODELS','/tmp/mk2-blender-decoded'))
MANIFEST=json.loads((MODELS/'manifest.json').read_text())
AUTHOR='sergio.pulido@alodai.com';records=[];rng=random.Random(482)
PALETTE={'ink':(.09,.12,.17),'slate':(.21,.29,.34),'metal':(.68,.78,.81),'white':(.86,.9,.88),'cyan':(.045,.72,.78),'orange':(.98,.36,.08),'sand':(.6,.44,.27),'wood':(.48,.27,.13),'soil':(.21,.12,.065),'green':(.12,.52,.30),'cream':(.79,.65,.40)}

def begin():
 for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
 for m in list(bpy.data.materials):bpy.data.materials.remove(m)
 global mats
 mats={}
 for name,c in PALETTE.items():
  m=bpy.data.materials.new('lab_'+name);m.use_nodes=True;p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.9;mats[name]=m
 bpy.context.scene.unit_settings.scale_length=1

def decorate(o,name,mat):
 o.name=name;o.data.materials.append(mats[mat]);return o

def box(name,p,dims,mat,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.scale=dims;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  b=o.modifiers.new('Soft readable edges','BEVEL');b.width=bevel;b.segments=2;bpy.ops.object.modifier_apply(modifier=b.name)
 return decorate(o,name,mat)

def cyl(name,p,r,h,mat,n=32,rotation=None):
 bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=h,location=p);o=bpy.context.object
 if rotation:o.rotation_euler=rotation
 return decorate(o,name,mat)

def polygon(name,points,z,mat):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata([(x,y,z) for x,y in points],[],[tuple(range(len(points)))]);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(o);return decorate(o,name,mat)

def rod(name,a,b,r,mat):
 a=Vector(a);b=Vector(b);o=cyl(name,(a+b)/2,r,(b-a).length,mat,n=12);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o

def rover(id):
 modules=['chassis','controller',id,'motor_torque','battery_large','camera','ultrasonic','bumper']
 for key in modules:
  bpy.ops.import_scene.gltf(filepath=str(MODELS/MANIFEST['modules'][key]['file']));root=bpy.data.objects['module_'+key]
  if key!=id:root.location.z=MANIFEST['deckOffsetY'][id]
 colors={'petg':'slate','rubber_and_chip':'ink','steel':'metal','brass':'cream','pcb':'green','polymer':'slate'}
 for o in bpy.context.scene.objects:
  if o.type=='MESH':
   for i,m in enumerate(o.data.materials):o.data.materials[i]=mats[colors.get(m.name.split('.')[0],'slate')]

IDS=['robot_wheels','robot_offroad','robot_tracks','parcel','delivery_bay','forklift','soil_sample_marker','lander','flag_cyan','flag_orange','stairs','door','wall','floor_concrete','floor_regolith','floor_wood']
for id in IDS:
 begin();category='prop';source='Original generic Blender geometry';footprint=[1,1]
 if id.startswith('robot_'):
  rover({'robot_wheels':'wheels','robot_offroad':'offroad_wheels','robot_tracks':'tracks'}[id]);category='actor';source='Published MK-II GLBs, decoded locally for rendering'
 elif id=='parcel':
  box('parcel_outline',(0,0,.28),(1.35,1.15,.56),'ink',.05);box('cardboard_top',(0,0,.57),(1.27,1.07,.025),'orange',.04)
  box('packing_tape_long',(0,0,.59),(1.26,.18,.014),'cream',.01);box('packing_tape_cross',(0,0,.60),(.18,1.06,.014),'cream',.01)
 elif id=='delivery_bay':
  for x in (-1,1):
   for y in (-1,1):
    box('bay_corner_x',(x*.78,y*.95,.03),(.48,.12,.06),'cyan',.02);box('bay_corner_y',(x*.95,y*.78,.03),(.12,.48,.06),'cyan',.02)
  polygon('entry_arrow',[(.55,0),(.05,-.4),(.05,-.15),(-.5,-.15),(-.5,.15),(.05,.15),(.05,.4)],.015,'cyan')
  category='marker'
 elif id=='forklift':
  footprint=[1,2];category='actor'
  box('forklift_body',(-.15,0,.40),(1.05,.95,.8),'orange',.08)
  for x in (-.5,.35):
   for y in (-.57,.57):box('forklift_tire',(x,y,.2),(.38,.22,.40),'ink',.04)
  box('driver_well',(-.05,0,.81),(.63,.60,.05),'ink',.04);box('seat',(-.28,0,.85),(.28,.38,.12),'slate',.03)
  cyl('steering_wheel',(.16,0,.89),.14,.04,'metal',n=16)
  for y in (-.35,.35):box('mast',(.46,y,.8),(.15,.13,1.55),'metal',.02);box('fork',(1.08,y,.08),(1.32,.13,.12),'ink',.015)
  box('mast_crossbar',(.46,0,1.25),(.14,.83,.13),'metal',.02)
 elif id=='soil_sample_marker':
  category='marker';cyl('sample_marker',(0,0,.015),.66,.03,'orange',n=6);cyl('sample_core',(0,0,.04),.40,.035,'ink');cyl('soil',(0,0,.06),.29,.035,'soil')
  for angle in (0,math.tau/3,math.tau*2/3):
   o=box('sampling_tick',(.50*math.cos(angle),.50*math.sin(angle),.04),(.16,.055,.025),'cream',.007);o.rotation_euler.z=angle
 elif id=='lander':
  category='actor'
  for x in (-1,1):
   for y in (-1,1):
    rod('landing_leg',(x*.4,y*.4,.5),(x*.9,y*.9,.1),.075,'metal');cyl('landing_foot',(x*.91,y*.91,.06),.18,.12,'orange',n=12)
  cyl('lander_hull',(0,0,.45),.68,.65,'metal',n=8);cyl('service_cover',(0,0,.81),.4,.06,'slate',n=8);cyl('hatch',(0,0,.85),.24,.045,'cream',n=16)
  for y in (-.42,.42):box('side_panel',(0,y,.81),(.54,.18,.035),'cyan',.02)
 elif id.startswith('flag_'):
  category='marker';color='cyan' if id.endswith('cyan') else 'orange'
  # Flat map symbol avoids the invisible edge of an upright flag viewed from above.
  box('flag_staff',(0,-.32,.02),(1.75,.075,.04),'metal',.012)
  polygon('flag_outline',[(.86,-.38),(.86,.68),(.32,.51),(-.02,.68),(-.02,-.38)],.02,'ink')
  polygon('flag_cloth',[(.79,-.29),(.79,.57),(.32,.39),(.07,.54),(.07,-.29)],.03,color)
 elif id=='stairs':
  for i in range(6):
   x=-.85+i*.34;h=.1+i*.12;box('step_'+str(i),(x,0,h/2),(.33,1.8,h),'metal',.012);box('step_nosing_'+str(i),(x-.145,0,h+.005),(.035,1.74,.01),'ink',.005)
  category='terrain'
 elif id=='door':
  category='terrain'
  for y in (-.9,.9):box('door_jamb',(0,y,.22),(.35,.25,.44),'metal',.025)
  box('hinge_post',(0,-.74,.20),(.15,.15,.4),'ink',.02)
  leaf=box('open_door',(-.48,-.38,.13),(1.28,.13,.26),'wood',.02);leaf.rotation_euler.z=-math.pi/4
  box('threshold',(0,0,.012),(.30,1.55,.024),'slate',.02)
 elif id=='wall':
  category='terrain';box('wall_outline',(0,0,.18),(.50,2.25,.36),'ink',.025);box('wall_top',(0,0,.375),(.40,2.15,.025),'metal',.015)
  for y in (-.55,.55):box('wall_joint',(0,y,.39),(.39,.035,.01),'slate',.002)
 elif id.startswith('floor_'):
  category='terrain';kind=id[6:];base={'concrete':'slate','regolith':'sand','wood':'wood'}[kind]
  box('tile',(0,0,.015),(2.44,2.44,.03),base,.012)
  if kind=='concrete':
   for y in (-.57,.57):box('concrete_joint',(0,y,.035),(2.42,.025,.006),'metal',.003)
   for x in (-.6,.6):box('concrete_joint',(x,0,.035),(.025,2.42,.006),'metal',.003)
  elif kind=='regolith':
   for i in range(15):
    x,y=rng.uniform(-1.05,1.05),rng.uniform(-1.05,1.05);cyl('regolith_pebble',(x,y,.045),rng.uniform(.028,.085),.04,'cream' if i%3 else 'soil',n=6)
  else:
   for x in (-.8,-.4,0,.4,.8):box('plank_joint',(x,0,.035),(.023,2.4,.006),'soil',.003)
   for x,y in [(-.6,.4),(-.2,-.4),(.2,.8),(.6,-.7)]:box('plank_end',(x,y,.036),(.36,.023,.006),'soil',.003)
 else:raise ValueError(id)
 scene=bpy.context.scene;scene['author']=AUTHOR;scene['spriteId']=id;scene['projection']='orthographic top-down; +X points up'
 camera=bpy.data.cameras.new('sprite_camera');cam=bpy.data.objects.new('sprite_camera',camera);scene.collection.objects.link(cam);bpy.context.view_layer.update();points=[o.matrix_world@Vector(c) for o in scene.objects if o.type=='MESH' for c in o.bound_box];cx=(min(p.x for p in points)+max(p.x for p in points))/2;cy=(min(p.y for p in points)+max(p.y for p in points))/2;cam.location=(cx,cy,8);cam.rotation_euler=(0,0,-math.pi/2);camera.type='ORTHO';camera.ortho_scale=2.55;scene.camera=cam
 world=bpy.data.worlds.new('lab_world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.8,.85,1,1);world.node_tree.nodes['Background'].inputs[1].default_value=.8;scene.world=world
 data=bpy.data.lights.new('lab_key','AREA');data.energy=200;data.size=5;light=bpy.data.objects.new('lab_key',data);scene.collection.objects.link(light);light.location=(-2,-3,6);light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
 scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=scene.render.resolution_y=256;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(OUT/(id+'.png'));scene.view_settings.view_transform='Standard'
 bpy.ops.wm.save_as_mainfile(filepath=str(HERE/(id+'.blend')));bpy.ops.render.render(write_still=True)
 records.append({'id':id,'file':'/renders/lab/'+id+'.png','path':str((OUT/(id+'.png')).relative_to(ROOT)),'category':category,'sizePx':[256,256],'anchor':[.5,.5],'forward':'up','suggestedFootprintCells':footprint,'source':source})
(ROOT/'docs/inputs/lab-sprites.json').write_text(json.dumps({'version':1,'author':AUTHOR,'sizePx':256,'format':'RGBA PNG','projection':'orthographic top-down; robot +X is image up','palette':{k:list(v) for k,v in PALETTE.items()},'sprites':records},indent=2)+'\n')
print('LAB SPRITES READY',len(records),flush=True)
