"""M9 Polar Night: original station, ice, snow and communications mast.
Author: sergio.pulido@alodai.com. No people, brands, vehicles or simulation changes.
"""
import bpy,bmesh,math,random,json,struct
from pathlib import Path
from mathutils import Vector,Matrix
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3];OUT=ROOT/'apps/web/public/env/m9';PROPS=OUT/'props';PROPS.mkdir(parents=True,exist_ok=True)
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
rng=random.Random(9009);root=None;collection=None;records=[]
# Reuse the already-validated metre-scale mesh and base-origin helpers, without running M7's generator.
helpers=(HERE.parent/'m7/build_props.py').read_text();helpers=helpers[helpers.index('CUBE_FACES='):helpers.index('for i in range(3):\n key=')]
helpers=helpers.replace('M7 PROP','M9 PROP').replace("'m7_'+key","'m9_'+key").replace("OUT/(key+'.glb')","PROPS/(key+'.glb')").replace("'/env/m7/props/'","'/env/m9/props/'")
exec(helpers)

def material(name,colour,rough=.85,metal=0,emission=0,noise=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes['Principled BSDF'];s.inputs['Base Color'].default_value=(*colour,1);s.inputs['Roughness'].default_value=rough;s.inputs['Metallic'].default_value=metal
 if emission:s.inputs['Emission Color'].default_value=(*colour,1);s.inputs['Emission Strength'].default_value=emission
 if noise:
  n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=18;n.inputs['Detail'].default_value=2;b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.12;b.inputs['Distance'].default_value=.025;m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs['Normal'],s.inputs['Normal'])
 return m
snow=material('m9_snow',(.72,.82,.92),.98,noise=True)
ice=material('m9_blue_ice',(.13,.28,.43),.64)
steel=material('m9_station_metal',(.28,.34,.43),.42,.72)
red=material('m9_station_red',(.42,.045,.025),.65)
white=material('m9_station_white',(.49,.56,.61),.75)
black=material('m9_dark_polymer',(.009,.016,.026),.83)
warm=material('m9_station_window',(.85,.45,.12),.5,emission=1.0)
beacon=material('m9_warning_red',(.9,.02,.008),.55,emission=1.4)
cold_light=material('m9_cold_white_light',(.55,.75,1),.5,emission=1.2)
collections={}
for key in ['far_ice','mid_station','near_snow']:
 c=bpy.data.collections.new(key);scene.collection.children.link(c);collections[key]=c

def drift(name,p,width,depth,height,mat=snow,variant=0):
 # Elliptical closed footprint: no rectangular sheet corners or holes at ground level.
 na,nr=40,12;vertices=[(0,0,height*(.85+.13*math.sin(variant)))]
 for ring in range(1,nr+1):
  r=ring/nr
  for i in range(na):
   a=i*math.tau/na;edge=.975+.025*math.sin(a*5+variant)
   u=r*math.cos(a)*edge;v=r*math.sin(a)*edge
   body=max(0,1-r*r)**.72*(.85+.13*math.sin(u*3+v*2+variant))
   z=height*body+height*.02*r*(1-r)*math.sin(u*22+v*10)
   vertices.append((u*width/2,v*depth/2,z))
 faces=[(0,1+i,1+(i+1)%na) for i in range(na)]
 for ring in range(nr-1):
  first=1+ring*na;second=first+na
  for i in range(na):
   j=(i+1)%na;faces.append((first+i,second+i,second+j,first+j))
 last=1+(nr-1)*na;faces.append(tuple(reversed(range(last,last+na))))
 o=mesh(name,vertices,faces,mat,p)
 for polygon in o.data.polygons:polygon.use_smooth=polygon.index<len(faces)-1
 return o

# Far ice ridge and an aurora, baked into one transparent image.
collection=collections['far_ice'];root=None
nx=90;xs=[-68+i*136/nx for i in range(nx+1)]
heights=[2.6+.65*math.sin(x*.055)+.38*math.sin(x*.16)+rng.uniform(-.14,.14) for x in xs]
vertices=[]
for y,upper in [(32,False),(32,True),(38,False),(38,True)]:
 for x,h in zip(xs,heights):vertices.append((x,y,h+( .24 if y==38 else 0) if upper else -3))
n=nx+1;faces=[]
for i in range(nx):
 faces.extend([(i,i+1,n+i+1,n+i),(2*n+i,3*n+i,3*n+i+1,2*n+i+1),
               (n+i,n+i+1,3*n+i+1,3*n+i),(i,2*n+i,2*n+i+1,i+1)])
faces.extend([(0,n,3*n,2*n),(nx,2*n-1,4*n-1,3*n-1)])
mesh('continuous_glacier_cliff',vertices,faces,ice)
cap=[]
for j in range(5):
 t=j/4
 for x,h in zip(xs,heights):cap.append((x,31.8+t*6.4,h+.14+.34*math.sin(t*math.pi)))
faces=[]
for j in range(4):
 for i in range(nx):
  v=j*n+i;faces.append((v,v+1,v+n+1,v+n))
snowcap=mesh('wind_carved_glacier_snowcap',cap,faces,snow)
for polygon in snowcap.data.polygons:polygon.use_smooth=True
verts=[]
for offset in [-.13,.14]:
 for x,h in zip(xs,heights):verts.append((x,31.79,h+offset))
mesh('overhanging_snow_cornice',verts,[(i,i+1,n+i+1,n+i) for i in range(nx)],snow)
box('polar_far_ground',(0,38,-11),(140,4,22),ice)
# Transparent/emissive aurora mesh with a soft vertical alpha gradient.
mat=bpy.data.materials.new('m9_baked_aurora');mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links;nodes.clear()
out=nodes.new('ShaderNodeOutputMaterial');attribute=nodes.new('ShaderNodeVertexColor');attribute.layer_name='aurora_tint';emission=nodes.new('ShaderNodeEmission');links.new(attribute.outputs['Color'],emission.inputs['Color']);emission.inputs['Strength'].default_value=.85
transparent=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader');links.new(attribute.outputs['Alpha'],mix.inputs[0]);links.new(transparent.outputs[0],mix.inputs[1]);links.new(emission.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],out.inputs['Surface'])
verts=[];nx,ny=150,10
for j in range(ny+1):
 t=j/ny
 for i in range(nx+1):
  x=-65+i*130/nx;z=2.5+math.sin(x*.08)*1.05+math.sin(x*.21)*.35+t*(4.5+math.sin(x*.15)*.8);verts.append((x,48+math.sin(x*.035)*2,z))
faces=[]
for j in range(ny):
 for i in range(nx):
  a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
aurora=mesh('soft_aurora_curtain',verts,faces,mat)
colours=aurora.data.color_attributes.new(name='aurora_tint',type='FLOAT_COLOR',domain='CORNER')
for polygon in aurora.data.polygons:
 for loop in polygon.loop_indices:
  index=aurora.data.loops[loop].vertex_index;i=index%(nx+1);t=(index//(nx+1))/ny
  edge=math.sin(math.pi*i/nx)**.4;alpha=.36*math.sin(math.pi*t)**1.8*edge*(.7+.3*math.sin(i*.25))
  colours.data[loop].color=(.065+.10*t,.52-.12*t,.26+.27*t,alpha)
for i in range(90):
 x=rng.uniform(-65,65);z=rng.uniform(2,10);y=54
 o=cylinder('polar_star',(x,y,z),rng.uniform(.025,.055),.005,cold_light,n=6);o.rotation_euler.x=math.pi/2

# Elevated modular research station, with warm windows and snow on the roof.
collection=collections['mid_station']
for index,(x,width) in enumerate([(-49,12),(-28,11),(-5,14),(22,12),(47,13)]):
 for px in [-width*.38,width*.38]:
  for y in [-1.8,1.8]:cylinder('station_stilt',(x+px,y,.6),.16,1.2,steel,n=10)
 box('station_floor',(x,0,1.2),(width+1.2,5.2,.22),steel,.04)
 box('insulated_station_module',(x,0,2.8),(width,4.5,3.0),red if index%2==0 else white,.08)
 box('snow_roof',(x,0,4.4),(width+.3,4.8,.35),snow,.06)
 for i in range(int(width*2)):
  # Corrugated cladding and structural trim read even at phone scale.
  box('cladding_rib',(x-width/2+.25+i*.5,-2.28,2.8),(.035,.04,2.8),steel)
 for i in range(4):
  wx=x-width*.34+i*width*.22
  box('window_frame',(wx,-2.33,3.0),(1.12,.10,1.10),black,.04)
  box('warm_station_window',(wx,-2.39,3.0),(.96,.03,.93),warm,.025)
  box('window_mullion',(wx,-2.42,3.0),(.035,.02,1),steel)
 box('weather_door',(x+width*.40,-2.32,2.4),(.9,.12,2.0),steel,.025)
 box('door_marker',(x+width*.40,-2.4,3.54),(.52,.03,.04),cold_light)
 drift('roof_snowdrift',(x,0,4.58),width*.95,4.1,.5,variant=index)
 for i in range(14):
  px=x-width/2+i*width/14
  rod('small_roof_icicle',(px,-2.35,4.23),(px,-2.35,4.02-rng.random()*.18),.015,ice)
 drift('station_foot_snow',(x,-2.0,0),width*1.2,6,.95,variant=index)
 if index<4:
  next_x=[-28,-5,22,47][index];gap=(next_x-width*.48)-(x+width*.48)
  if gap>0:box('raised_connector',(x+width*.5+gap*.5,.9,2.28),(gap,1.8,1.6),steel,.04)
# A scientific radome and access platform, without branding.
bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=1.5,location=(8,1,5.4));o=bpy.context.object
for c in list(o.users_collection):c.objects.unlink(o)
collection.objects.link(o);o.name='station_radome';o.data.materials.append(white)
box('radome_support',(8,1,2.1),(1.1,1.1,4.2),steel,.025)
box('radome_pedestal',(8,1,4.45),(2.4,2.4,.6),steel,.05)
# Station mast in the backdrop (runtime mast is exported separately below).
for x in [-37,34]:
 rod('station_antenna_mast',(x,0,0),(x,0,8),.06,steel)
 for side in [-1,1]:rod('station_antenna_guy',(x,0,5),(x+side*2.4,-.7,0),.017,steel)
 rod('station_antenna_crossbar',(x-1,0,7.1),(x+1,0,7.1),.025,steel)
 cylinder('station_mast_warning',(x,0,8.08),.10,.14,beacon)

collection=collections['near_snow']
box('near_snow_ground',(0,-20,-2.2),(140,6,4.4),snow)
for i in range(25):
 x=-67+i*5.5
 drift('near_wind_drift',(x,-19.5+rng.uniform(-1,1),0),rng.uniform(6,11),rng.uniform(2,4),rng.uniform(.35,.95),variant=i)

# A reusable four-piece runtime kit: three snow drifts and a guyed communications mast.
prop_collections=[]
for i,(w,d,h) in enumerate([(2.5,1.3,.38),(3.9,1.6,.70),(2.6,2.1,1.05)]):
 key='snowdrift_'+str(i+1).zfill(2);start(key);prop_collections.append(collection);drift('wind_carved_snow',(0,0,0),w,d,h,variant=i);finish(key,'Smooth wind-carved drift. Low versions may sit near the street; keep driving lanes and the M9 scan pad clear.')
start('antenna_mast');prop_collections.append(collection)
box('mast_base',(0,0,.07),(.52,.52,.14),steel,.015)
rod('main_mast',(0,0,.12),(0,0,4.2),.045,steel,n=12)
for i in range(3):
 a=i*math.tau/3;foot=(1.0*math.cos(a),1.0*math.sin(a),.02)
 box('guy_anchor',foot,(.15,.15,.04),steel,.005)
 rod('guy_wire',(0,0,2.8),foot,.007,steel,n=6)
rod('antenna_crossbar',(-.52,0,3.72),(.52,0,3.72),.022,steel)
for x in [-.48,0,.48]:rod('antenna_dipole',(x,-.24,3.72),(x,.24,3.72),.011,steel,n=6)
box('weatherproof_radio',(0,.07,1.6),(.22,.13,.28),white,.015)
cylinder('warning_lens',(0,0,4.25),.068,.10,beacon,n=12)
finish('antenna_mast','Generic guyed radio mast, weatherproof radio and red warning lens. Tall scenery behind the far lane; no exported lights.')
(HERE/'prop_records.json').write_text(json.dumps(records,indent=2)+'\n')

# Camera and lighting shared with M7: no overhead toy-map perspective.
cd=bpy.data.cameras.new('m9_side_camera');cam=bpy.data.objects.new('m9_side_camera',cd);scene.collection.objects.link(cam);target=Vector((0,0,6));cam.location=target+Vector((0,-120,120*math.tan(math.radians(15))));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=128;scene.camera=cam
world=bpy.data.worlds.new('polar_night_world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.22,.39,1);world.node_tree.nodes['Background'].inputs[1].default_value=.50;scene.world=world
for name,p,energy,colour,size in [('blue_moon',(-30,-20,35),22000,(.46,.64,1),45),('ice_fill',(40,-20,25),16000,(.50,.77,1),50),('station_warm_fill',(0,-10,14),4500,(1,.66,.33),35)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=colour;data.size=size;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=p;o.rotation_euler=(Vector((0,10,2))-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=4096;scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.3
for c in prop_collections:c.hide_render=True
scene['author']='sergio.pulido@alodai.com';bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'m9_environment.blend'))
for key,c in collections.items():
 for other in collections.values():other.hide_render=other!=c
 scene.render.filepath=str(OUT/(key+'.png'));bpy.ops.render.render(write_still=True);print('M9 LAYER',key,flush=True)
