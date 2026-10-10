"""M7 metre-scale disaster prop kit. Author: sergio.pulido@alodai.com.
Original generic props: no humans, logos, vehicles or manufacture outputs.
"""
import bpy,bmesh,math,random,json,struct
from pathlib import Path
from mathutils import Vector,Matrix
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3];OUT=ROOT/'apps/web/public/env/m7/props';OUT.mkdir(parents=True,exist_ok=True)
rng=random.Random(7107)
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
root=None;collection=None;records=[]

def material(name,colour,rough=.85,metal=0,emission=0,texture=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes['Principled BSDF'];s.inputs['Base Color'].default_value=(*colour,1);s.inputs['Roughness'].default_value=rough;s.inputs['Metallic'].default_value=metal
 if emission:s.inputs['Emission Color'].default_value=(*colour,1);s.inputs['Emission Strength'].default_value=emission
 if texture:
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(HERE/'textures/concrete_basecolor.png'),check_existing=True);m.node_tree.links.new(t.outputs['Color'],s.inputs['Base Color'])
 return m
concrete=material('m7_concrete',(.35,.33,.29),texture=True)
brick=material('m7_brick',(.31,.095,.045))
rust=material('m7_rusted_rebar',(.20,.065,.025),.8,.6)
steel=material('m7_galvanised_steel',(.38,.43,.47),.48,.75)
black=material('m7_dark_polymer',(.012,.015,.018),.78)
yellow=material('m7_hazard_yellow',(.95,.52,.018),.65)
orange=material('m7_safety_orange',(.95,.16,.012),.7)
white_light=material('m7_warm_led',(.95,.79,.53),.5,emission=2)
beacon_light=material('m7_rescue_cyan',(.02,.7,.85),.5,emission=1.6)

CUBE_FACES=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
def mesh(name,vertices,faces,mat,p=(0,0,0)):
 data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update();bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 obj=bpy.data.objects.new(name,data);collection.objects.link(obj);obj.parent=root;obj.location=p;data.materials.append(mat)
 # Repeat a 1-m concrete tile. Box projection on each face is baked as ordinary UVs.
 uv=data.uv_layers.new(name='surface_uv')
 for polygon in data.polygons:
  axis=max(range(3),key=lambda i:abs(polygon.normal[i]));indices=[i for i in range(3) if i!=axis]
  for loop in polygon.loop_indices:
   q=data.vertices[data.loops[loop].vertex_index].co;uv.data[loop].uv=(q[indices[0]],q[indices[1]])
 return obj

def box(name,p,size,mat,bevel=0,rotation=None):
 w,d,h=size;verts=[(x*w/2,y*d/2,z*h/2) for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 o=mesh(name,verts,CUBE_FACES,mat,p)
 if rotation:o.rotation_euler=rotation
 if bevel:
  bpy.context.view_layer.objects.active=o;modifier=o.modifiers.new('Worn edge bevel','BEVEL');modifier.width=bevel;modifier.segments=1;bpy.ops.object.modifier_apply(modifier=modifier.name)
 return o

def cylinder(name,p,r,h,mat,n=12):
 vertices=[(r*math.cos(i*math.tau/n),r*math.sin(i*math.tau/n),z) for z in [-h/2,h/2] for i in range(n)]
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,vertices,faces,mat,p)

def rod(name,a,b,r,mat,n=8):
 delta=Vector(b)-Vector(a);o=cylinder(name,tuple((Vector(a)+Vector(b))/2),r,delta.length,mat,n);o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();return o

def slab(name,p,width,depth,height,rotation=(0,0,0)):
 # An irregular fracture boundary, not a smooth low-poly boulder.
 polygon=[(-.5,-.5),(-.1,-.52),(.5,-.45),(.48,.08),(.34,.17),(.39,.38),(.09,.5),(-.31,.43),(-.5,.18)]
 vertices=[(x*width,y*depth,z) for z in [-height/2,height/2] for x,y in polygon];n=len(polygon)
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 o=mesh(name,vertices,faces,concrete,p);o.rotation_euler=rotation
 bpy.context.view_layer.objects.active=o;m=o.modifiers.new('Small chipped arris','BEVEL');m.width=min(.018,height*.08);m.segments=1;bpy.ops.object.modifier_apply(modifier=m.name)
 return o

def crack(p,points,width=.006,reference=None):
 bpy.context.view_layer.update()
 for i in range(len(points)-1):
  a=Vector((points[i][0]+p[0],points[i][1]+p[1],p[2]));b=Vector((points[i+1][0]+p[0],points[i+1][1]+p[1],p[2]))
  if reference:a=reference.matrix_world@a;b=reference.matrix_world@b
  rod('surface_fissure',a,b,width,black,n=4)

def start(key):
 global root,collection
 collection=bpy.data.collections.new(key);scene.collection.children.link(collection)
 root=bpy.data.objects.new('m7_'+key,None);collection.objects.link(root);root['author']='sergio.pulido@alodai.com';root['units']='metres';root['origin']='base-centre'

def finish(key,notes):
 bpy.context.view_layer.update();meshes=[o for o in root.children_recursive if o.type=='MESH'];points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
 offset=Vector(((min(p.x for p in points)+max(p.x for p in points))/2,(min(p.y for p in points)+max(p.y for p in points))/2,min(p.z for p in points)))
 for o in meshes:o.location-=offset
 groups={}
 for o in meshes:groups.setdefault(o.data.materials[0],[]).append(o)
 for material,objects in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0]
  if len(objects)>1:bpy.ops.object.join()
  bpy.context.object.name=key+'__'+material.name
 # Bake child transforms before centring: rotated submesh AABBs otherwise inflate the footprint.
 bpy.context.view_layer.update()
 meshes=[o for o in root.children_recursive if o.type=='MESH']
 for o in meshes:
  o.data.transform(o.matrix_world);o.matrix_world=Matrix.Identity(4)
 points=[v.co for o in meshes for v in o.data.vertices]
 centre=Vector(((min(p.x for p in points)+max(p.x for p in points))/2,(min(p.y for p in points)+max(p.y for p in points))/2,min(p.z for p in points)))
 for o in meshes:
  for v in o.data.vertices:v.co-=centre
  o.data.update()
 bpy.ops.object.select_all(action='DESELECT')
 for o in [root,*root.children_recursive]:o.select_set(True)
 bpy.context.view_layer.objects.active=root
 path=OUT/(key+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False,export_original_specular=False)
 data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+length]);triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
 bpy.context.view_layer.update();points=[o.matrix_world@Vector(c) for o in root.children_recursive if o.type=='MESH' for c in o.bound_box]
 envelope=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
 records.append({'id':key,'file':'props/'+path.name,'url':'/env/m7/props/'+path.name,'sizeBytes':len(data),'triangles':triangles,'suggestedScale':1,'envelopeM':[round(envelope[0],3),round(envelope[2],3),round(envelope[1],3)],'root':root.name,'origin':'base-centre','upAxis':'+Y','units':'metres','compression':'none_intermediate','notes':notes})
 for o in [root,*root.children_recursive]:o.select_set(False)
 print('M7 PROP',key,triangles,len(data),flush=True)

for i in range(3):
 key='cracked_slab_'+str(i+1).zfill(2);start(key)
 w,d,h=[(1.5,.95,.16),(1.05,.8,.22),(1.8,.65,.12)][i]
 base=slab('fractured_concrete',(0,0,h/2),w,d,h,rotation=(0,.08*i,.06*i))
 # The first slab's front edge opens onto a visible crack; branches read at game-camera distance.
 crack((0,0,h/2+.001),[(-w*.45,-d*.10),(-w*.2,-d*.03),(0,d*.07),(w*.12,-d*.05),(w*.39,-d*.2)],reference=base)
 crack((0,0,h/2+.001),[(0,d*.07),(-.04,d*.3),(.06,d*.45)],.004,reference=base)
 for c in range(5):slab('spalled_edge_chip',(w*.4+rng.uniform(-.06,.15),-d*.3+rng.uniform(-.10,.15),.03),.08,.10,.04,rotation=(.2,.3,rng.random()*6))
 finish(key,'Broken concrete with chipped outline and branching surface fractures. Low prop for track edges; keep clear of drive lanes.')

start('slab_rebar')
reinforced=slab('reinforced_slab',(0,0,.15),1.7,1.1,.22,rotation=(0,-.13,0))
crack((0,0,.111),[(-.65,-.1),(-.2,-.05),(.1,.15),(.65,.04)],reference=reinforced)
for y in [-.35,-.10,.15,.4]:
 rod('embedded_rebar',(-.6,y,.15),(.72,y,.24),.012,rust)
 rod('protruding_rebar',(.72,y,.24),(1.12,y+.04,.65),.012,rust)
 rod('bent_rebar_tip',(1.12,y+.04,.65),(1.33,y+.10,.62),.012,rust)
finish('slab_rebar','Rusty reinforcement emerges through the broken slab edge. Place at the back of the street, away from scan pads.')

for variant in [1,2]:
 key='rubble_pile_'+str(variant).zfill(2);start(key)
 for i in range(30 if variant==1 else 24):
  a=rng.random()*math.tau;r=rng.random()**.6*(1.1 if variant==1 else .9)
  height=max(0,.45*(1-r/(1.3 if variant==1 else 1.1)));w=rng.uniform(.18,.6)
  slab('broken_chunk',(r*math.cos(a),r*.7*math.sin(a),height+rng.uniform(.01,.12)),w,w*rng.uniform(.6,1.1),rng.uniform(.10,.25),rotation=(rng.uniform(-.4,.4),rng.uniform(-.5,.5),rng.random()*math.tau))
 for i in range(9):box('loose_brick',(rng.uniform(-.9,.9),rng.uniform(-.55,.55),.06),(.23,.11,.08),brick,.008,rotation=(rng.uniform(-.1,.1),rng.uniform(-.2,.2),rng.random()*math.tau))
 for i in range(3):rod('bent_rubble_rebar',(-.3+i*.22,-.15,.08),(.25+i*.13,.18,.50),.011,rust)
 finish(key,'Concrete rubble, brick and bent reinforcement. Use variant rotation about +Y for less repeated silhouettes.')

start('collapsed_wall')
box('left_concrete_pier',(-1.15,0,1.13),(.38,.42,2.26),concrete,.025)
box('right_snapped_pier',(1.12,0,.65),(.4,.42,1.3),concrete,.028,rotation=(0,-.12,0))
box('broken_window_sill',(-.3,0,.6),(1.4,.36,.17),concrete,.02)
box('fallen_header',(-.38,0,1.8),(1.85,.40,.25),concrete,.028,rotation=(0,-.26,0))
for row in range(10):
 count=5 if row<4 else max(1,5-(row-3)//2)
 for col in range(count):
  x=-1.1+col*.25+(row%2)*.11
  box('exposed_brick',(x,-.03,.10+row*.16),(.23,.20,.14),brick,.012)
for x in [-1.24,-1.06]:rod('broken_pier_rebar',(x,0,2.2),(x+.18,.04,2.62),.012,rust)
for i in range(4):slab('wall_fallout',(.3+i*.3,-.1,.1),.45,.38,.15,rotation=(0,.25,rng.random()*2))
finish('collapsed_wall','Partly collapsed reinforced masonry around an empty window opening. Tall scenery behind the far lane only.')

start('crash_barrier')
for x in [-1.05,1.05]:
 box('steel_post',(x,.04,.45),(.09,.11,.9),steel,.007,rotation=(0,.07,0))
 box('post_base',(x,.04,.025),(.22,.20,.05),steel,.006)
 for sign in [-1,1]:cylinder('anchor_bolt',(x+sign*.07,.04,.06),.015,.02,steel,n=8)
# A crumpled W-profile guardrail, rather than a flat rectangular beam.
profile=[(-.025,-.16),(-.065,-.12),(.035,-.04),(-.02,0),(.035,.04),(-.065,.12),(-.025,.16)]
vertices=[]
for i in range(17):
 x=-1.45+i*2.9/16;dent=.13*math.exp(-((x-.2)/.42)**2)
 for y,z in profile:vertices.append((x,y-dent,.67+z-.06*math.exp(-((x-.1)/.4)**2)))
faces=[];n=len(profile)
for i in range(16):
 for j in range(n-1):faces.append((i*n+j,(i+1)*n+j,(i+1)*n+j+1,i*n+j+1))
rail=mesh('dented_guardrail',vertices,faces,steel);rail.data.materials[0].use_backface_culling=False
finish('crash_barrier','Bent galvanised W-beam rail with posts and base bolts. Align long axis +X along the street.')

start('warning_tape_posts')
for x in [-1.3,1.3]:
 cylinder('portable_base',(x,0,.035),.16,.07,black,n=16);cylinder('cordon_post',(x,0,.57),.025,1.07,steel)
 cylinder('yellow_cap',(x,0,1.13),.04,.065,yellow)
# Two-sided ribbon, with diagonal black patches built into the mesh.
for i in range(26):
 x0=-1.3+i*.1;x1=x0+.1
 z0=.87-.14*(1-(x0/1.3)**2);z1=.87-.14*(1-(x1/1.3)**2)
 mesh('yellow_tape',[(x0,-.015,z0),(x1,-.015,z1),(x1,-.015,z1+.085),(x0,-.015,z0+.085)],[(0,1,2,3)],yellow)
 if i%2==0:mesh('black_diagonal',[(x0,-.018,z0),(x0+.055,-.018,z0),(x1,-.018,z1+.085),(x1-.055,-.018,z1+.085)],[(0,1,2,3)],black)
finish('warning_tape_posts','Portable cordon with sagging yellow/black tape. Place behind hazards; it is decorative and must not change collision geometry.')

start('emergency_tripod_light')
cylinder('telescopic_column',(0,0,1.08),.027,1.84,steel)
for i in range(3):
 a=i*math.tau/3;foot=(.52*math.cos(a),.52*math.sin(a),.04)
 rod('tripod_leg',(0,0,.70),foot,.021,black)
 box('rubber_foot',foot,(.10,.10,.07),black,.015)
box('battery_box',(0,.09,.20),(.25,.18,.3),black,.02)
box('light_housing',(0,0,2.02),(.48,.14,.31),orange,.022)
box('front_lens',(0,-.076,2.02),(.42,.012,.25),black,.012)
for row in range(3):
 for col in range(6):
  led=cylinder('work_light_led',(-.17+col*.068,-.085,1.94+row*.08),.023,.006,white_light,n=8);led.rotation_euler.x=math.pi/2
box('carry_handle',(0,.01,2.24),(.25,.07,.035),black,.006)
finish('emergency_tripod_light','Portable warm LED work light. Emissive surface only: no exported light or extra shadow pass.')

start('rescue_beacon')
box('beacon_base',(0,0,.09),(.34,.30,.18),black,.025)
cylinder('lens_mount',(0,0,.22),.125,.08,yellow,n=20)
cylinder('scan_lens',(0,0,.40),.105,.28,beacon_light,n=24)
cylinder('lens_cap',(0,0,.555),.117,.03,black,n=20)
for i in range(4):
 a=i*math.tau/4;rod('lens_protection',(math.cos(a)*.116,math.sin(a)*.116,.27),(math.cos(a)*.116,math.sin(a)*.116,.55),.009,steel)
box('recessed_control',(0,-.155,.09),(.10,.008,.055),beacon_light)
finish('rescue_beacon','Cyan scan-zone marker, distinct from amber hazard lighting. Optional pulse by varying m7_rescue_cyan emissiveIntensity in the game; no animation or people.')

assert sum(p['triangles'] for p in records)<=30000
bpy.context.scene['author']='sergio.pulido@alodai.com';bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'m7_props.blend'))
(HERE/'prop_records.json').write_text(json.dumps(records,indent=2)+'\n')
print('M7 TOTAL TRIANGLES',sum(p['triangles'] for p in records),flush=True)
