"""M7 collapsed-city parallax artwork. Author: sergio.pulido@alodai.com.
Deterministic Blender scenery, no figures, logos or vehicle changes.
"""
import bpy,math,random,json,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[4]
HERE=Path(__file__).resolve().parent
OUT=ROOT/'apps/web/public/env/m7';OUT.mkdir(parents=True,exist_ok=True)
rng=random.Random(7007)
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
collections={}
for key in ['far_skyline','mid_ruins','near_rubble']:
 c=bpy.data.collections.new(key);scene.collection.children.link(c);collections[key]=c
layer=collections['far_skyline']
def link(o,name):
 o.name=name
 for c in list(o.users_collection):c.objects.unlink(o)
 layer.objects.link(o);return o

def material(name,colour,rough=.9,metal=0,noise=False,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes['Principled BSDF'];s.inputs['Base Color'].default_value=(*colour,1);s.inputs['Roughness'].default_value=rough;s.inputs['Metallic'].default_value=metal
 if emission:s.inputs['Emission Color'].default_value=(*colour,1);s.inputs['Emission Strength'].default_value=emission
 if noise:
  nodes=m.node_tree.nodes;links=m.node_tree.links;n=nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=6;n.inputs['Detail'].default_value=3
  ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=tuple(v*.68 for v in colour)+(1,);ramp.color_ramp.elements[1].color=tuple(min(1,v*1.25) for v in colour)+(1,)
  links.new(n.outputs['Fac'],ramp.inputs['Fac']);links.new(ramp.outputs['Color'],s.inputs['Base Color'])
  bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.24;bump.inputs['Distance'].default_value=.08;links.new(n.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],s.inputs['Normal'])
 return m
concrete=[material('dusty_concrete_'+str(i),c,noise=True) for i,c in enumerate([(.31,.29,.26),(.42,.40,.36),(.26,.27,.28),(.47,.43,.36)])]
brick=material('exposed_brick',(.30,.12,.065),noise=True)
rust=material('oxidised_steel',(.20,.075,.035),.75,.45)
dark=material('interior_shadow',(.025,.031,.04))
farwall=material('distant_dusk_concrete',(.115,.135,.17),noise=True)
farwindow=material('distant_window',(.03,.047,.065))
windowlight=material('remaining_amber_light',(.8,.28,.04),emission=.8)
blue=material('cold_dusk_metal',(.095,.15,.19),.65,.4)

def cube(name,p,size,mat,bevel=0,rotation=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Chipped edges','BEVEL');mod.width=bevel;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
 if rotation:o.rotation_euler=rotation
 o.data.materials.append(mat);return link(o,name)

def rod(name,start,end,radius,mat):
 d=Vector(end)-Vector(start);bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=radius,depth=d.length,location=(Vector(start)+Vector(end))/2);o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(mat);return link(o,name)

def shard(name,p,scale,mat):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=p);o=bpy.context.object
 for v in o.data.vertices:v.co*=rng.uniform(.78,1.16)
 o.scale=scale;o.rotation_euler=(rng.random()*2,rng.random()*2,rng.random()*math.tau);o.data.materials.append(mat);return link(o,name)

def smoke_material():
 m=bpy.data.materials.new('soft_turbulent_smoke');m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;n.clear()
 out=n.new('ShaderNodeOutputMaterial');volume=n.new('ShaderNodeVolumePrincipled');volume.inputs['Color'].default_value=(.24,.26,.30,1);volume.inputs['Anisotropy'].default_value=.15
 tex=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=5;noise.inputs['Detail'].default_value=4;l.new(tex.outputs['Generated'],noise.inputs['Vector'])
 distance=n.new('ShaderNodeVectorMath');distance.operation='DISTANCE';distance.inputs[1].default_value=(.5,.5,.5);l.new(tex.outputs['Generated'],distance.inputs[0])
 falloff=n.new('ShaderNodeMapRange');falloff.clamp=True;falloff.inputs['From Min'].default_value=.18;falloff.inputs['From Max'].default_value=.52;falloff.inputs['To Min'].default_value=1;falloff.inputs['To Max'].default_value=0;l.new(distance.outputs['Value'],falloff.inputs['Value'])
 mul=n.new('ShaderNodeMath');mul.operation='MULTIPLY';l.new(noise.outputs['Fac'],mul.inputs[0]);l.new(falloff.outputs['Result'],mul.inputs[1])
 density=n.new('ShaderNodeMath');density.operation='MULTIPLY';density.inputs[1].default_value=.38;l.new(mul.outputs[0],density.inputs[0]);l.new(density.outputs[0],volume.inputs['Density']);l.new(volume.outputs['Volume'],out.inputs['Volume']);return m

# Distant skyline: the ground projects at 40% of image height with the 15-degree camera.
layer=collections['far_skyline']
x=-63
while x<63:
 w=rng.uniform(2.3,5.4);h=rng.uniform(3.0,9.0);y=rng.uniform(34,37)
 damaged=rng.random()<.38
 cube('far_building',(x+w/2,y,h/2),(w,rng.uniform(2,4),h),farwall,.03,rotation=(0,rng.uniform(-.04,.04) if damaged else 0,0))
 for row in range(1,int(h/.75)):
  for col in range(max(2,int(w/.75))):
   if damaged and rng.random()<.18:continue
   cube('far_window',(x+.4+col*.7,y-2.05,row*.75),(.30,.03,.38),windowlight if rng.random()<.035 else farwindow)
 if damaged:
  cube('sheared_roof',(x+w*.5,y-.1,h),(.85*w,2,.13),farwall,rotation=(0,.18,0))
 x+=w+.35+rng.uniform(0,1.2)
cube('far_city_footing',(0,36,-12),(132,4,24),farwall)
smoke=smoke_material()
for sx in [-49,-23,4,33,51]:
 for i in range(4):
  cube('rising_smoke',(sx+i*.6,33,5+i*2.7),(2.5+i*.9,3+i*.35,4.5),smoke,rotation=(0,.1+i*.03,0))

# Middle distance: open floors, snapped pillars, missing facade sections and visible rebar.
layer=collections['mid_ruins']
for index,(x,width,floors) in enumerate([(-53,11,3),(-36,9,2),(-20,13,3),(0,12,2),(18,13,3),(38,10,2),(54,11,3)]):
 y=rng.uniform(0,3);floor_h=2.45
 cube('unlit_interior',(x,y+2.2,floors*floor_h/2),(width,1.5,floors*floor_h),dark)
 for f in range(floors+1):
  z=.12+f*floor_h
  length=width*(.75 if f==floors else 1)
  cube('broken_floor_plate',(x-rng.uniform(0,1),y,z),(length,4.4,.22),concrete[index%4],.05,rotation=(0,rng.uniform(-.07,.07) if f==floors else 0,0))
 for column in range(5):
  cx=x-width/2+column*width/4;height=floors*floor_h-rng.uniform(0,2.5)
  cube('snapped_column',(cx,y-1.7,height/2),(.4,.5,height),concrete[(index+1)%4],.04)
  for offset in [-.09,.09]:rod('column_rebar',(cx+offset,y-1.7,height-.05),(cx+offset+.12,y-1.7,height+.55),.018,rust)
 for f in range(floors):
  # Surviving brick infill panels leave large, uneven empty windows.
  for side in [-1,1]:
   if rng.random()<.28:continue
   cx=x+side*width*.34
   for row in range(5):
    count=rng.randint(4,8)
    for col in range(count):
     cube('brick_infill',(cx+(col-count/2)*.32+(row%2)*.16,y-1.98,f*floor_h+.2+row*.19),(.30,.19,.17),brick,.018)
  if rng.random()<.65:
   rod('broken_window_frame',(x-width*.22,y-2.06,f*floor_h+.35),(x+width*.12,y-2.06,f*floor_h+1.9),.025,blue)
 # Fallen slabs lean into the void, with reinforcement beyond the fracture.
 cube('fallen_facade_slab',(x+width*.35,y-2.7,1.65),(width*.42,.3,3.1),concrete[(index+2)%4],.06,rotation=(.12,-.5,.06))
 for r in range(28):
  px=x+rng.uniform(-width*.55,width*.55);size=rng.uniform(.2,.7)
  shard('mid_debris',(px,y-3+rng.uniform(-1,3),size*.3),(size,size*.65,size*.5),rng.choice(concrete))
 # Vertical fracture lines visible at phone scale, without using flat box slabs only.
 for side in [-1,1]:
  cx=x+side*width*.4
  rod('diagonal_fracture',(cx,y-2.08,1.4),(cx+.65,y-2.09,2.1),.027,dark)

# Foreground: a continuous low rubble line, no objects tall enough to mask the rover.
layer=collections['near_rubble']
cube('near_broken_street',(0,-19.5,-2.4),(132,6,4.8),concrete[2],.08)
for i in range(360):
 x=rng.uniform(-66,66);y=rng.uniform(-21.5,-17);size=rng.uniform(.14,.85)
 if i%7==0:
  cube('near_shattered_slab',(x,y,rng.uniform(.15,.55)),(size*2,size,.14),rng.choice(concrete),.04,rotation=(rng.uniform(-.4,.4),rng.uniform(-.6,.6),rng.random()*math.tau))
 else:shard('near_rubble',(x,y,size*.32),(size,size*.6,size*.5),rng.choice(concrete+[brick]))
 if i%30==0:rod('exposed_rubble_rebar',(x,y,.08),(x+.6,y+.1,.5),.018,rust)

# Orthographic side elevation matches the game's approximately 15-degree depression angle.
cd=bpy.data.cameras.new('m7_side_camera');cam=bpy.data.objects.new('m7_side_camera',cd);scene.collection.objects.link(cam)
target=Vector((0,0,6));cam.location=target+Vector((0,-120,120*math.tan(math.radians(15))));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=128;scene.camera=cam
world=bpy.data.worlds.new('dusk_ambient');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.31,.39,.55,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
for name,p,energy,colour,size in [('warm_dusk',(-45,-15,25),9500,(1,.52,.27),40),('cool_sky',(0,-30,45),17000,(.56,.70,1),55),('ruins_fill',(40,-25,18),7500,(1,.79,.56),35)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=colour;d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=p;o.rotation_euler=(Vector((0,12,2))-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.cycles.volume_bounces=1
scene.render.resolution_x=4096;scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True;scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.25
scene['author']='sergio.pulido@alodai.com';scene['cameraDepressionDegrees']=15;scene['horizonFromTop']=.4
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'m7_city_layers.blend'))
for key,c in collections.items():
 for other in collections.values():other.hide_render=other!=c
 scene.render.filepath=str(OUT/(key+'.png'));bpy.ops.render.render(write_still=True);print('M7 LAYER',key,flush=True)
