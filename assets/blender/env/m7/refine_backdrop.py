"""Art refinement of collapsed facades and smoke. Author: sergio.pulido@alodai.com."""
import bpy,bmesh,math,random
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3];OUT=ROOT/'apps/web/public/env/m7'
bpy.ops.wm.open_mainfile(filepath=str(HERE/'m7_city_layers.blend'));scene=bpy.context.scene;rng=random.Random(70771)
collections={key:bpy.data.collections[key] for key in ['far_skyline','mid_ruins','near_rubble']}
concrete=[bpy.data.materials['dusty_concrete_'+str(i)] for i in range(4)];brick=bpy.data.materials['exposed_brick'];dark=bpy.data.materials['interior_shadow'];rust=bpy.data.materials['oxidised_steel'];farwall=bpy.data.materials['distant_dusk_concrete']
source=(HERE/'build_backdrop.py').read_text();exec(source[source.index('def link('):source.index('def material(')]);exec(source[source.index('def cube('):source.index('def smoke_material(')])
# Stronger turbulent smoke retains smooth transparent edges and shares the far layer.
smoke=bpy.data.materials['soft_turbulent_smoke']
for node in smoke.node_tree.nodes:
 if node.bl_idname=='ShaderNodeMath' and node.operation=='MULTIPLY' and abs(node.inputs[1].default_value-.38)<.001:node.inputs[1].default_value=1.1
 if node.bl_idname=='ShaderNodeVolumePrincipled':node.inputs['Color'].default_value=(.12,.14,.17,1)
layer=collections['far_skyline']
# Broken high-rise silhouette: separated upper storeys and a torn roof.
for x in [-40,14,44]:
 building=min((o for o in bpy.data.objects if o.name.startswith('far_building')),key=lambda o:abs(o.location.x-x))
 bpy.context.view_layer.update();roof=max((building.matrix_world@Vector(c)).z for c in building.bound_box)
 upper=cube('far_collapsed_upper',(building.location.x,building.location.y,roof+.08),(3.3,3,.22),farwall,.03,rotation=(0,.24 if x<0 else -.2,0))
 bpy.context.view_layer.update();top=max((upper.matrix_world@Vector(c)).z for c in upper.bound_box)
 for i in range(3):cube('far_roof_debris',(building.location.x+(i-1)*.8,building.location.y,upper.location.z-(i-1)*.8*math.sin(upper.rotation_euler.y)+.11*math.cos(upper.rotation_euler.y)+.08),(.4,.6,.2),farwall,rotation=(.2,i*.2,.1))
layer=collections['mid_ruins']

def broken_panel(name,p,width,height,mat):
 # Jagged wall profile around a missing top corner and a diagonal earthquake fracture.
 profile=[(-width/2,0),(width/2,0),(width/2,height*.37),(width*.29,height*.48),(width*.24,height*.79),(width*.06,height*.69),(-width*.03,height),(-width*.38,height*.92),(-width/2,height*.66)]
 n=len(profile);verts=[(x,y,z) for y in [-.12,.12] for x,z in profile]
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update();bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free();o=bpy.data.objects.new(name,data);layer.objects.link(o);o.location=p;data.materials.append(mat);return o
for i,(x,width,height) in enumerate([(-56,4,4.7),(-34,3,3.1),(-17,3.6,5.2),(-2,3.1,3.7),(21,4,5.1),(37,3.2,3.8),(55,4,4.5)]):
 panel=broken_panel('fractured_plaster_facade',(x,-2.1,.15),width,height,concrete[i%4]);panel.rotation_euler.y=rng.uniform(-.11,.11)
 # Missing plaster exposes masonry, while dark cracks branch across the surviving panel.
 for row in range(8):
  for col in range(rng.randint(3,7)):
   cube('facade_exposed_masonry',(x-width*.3+col*.24+(row%2)*.12,-2.25,.3+row*.18),(.22,.09,.16),brick,.01)
 z=.9
 for a in range(4):
  xx=x-width*.1+a*.12;rod('facade_deep_crack',(xx,-2.24,z+a*.55),(xx+.17,-2.25,z+(a+1)*.55),.034,dark)
 # A floor plate dropped into a lower storey; retained slabs have snapped edges.
 cube('pancaked_floor',(x+width*.38,-.6,2.1),(width*1.18,4,.22),concrete[(i+1)%4],.04,rotation=(rng.uniform(-.06,.06),rng.choice([-.27,.30,.41]),.04))
 for j in range(3):rod('dangling_floor_rebar',(x+(j-1)*.22,-2.4,2.45),(x+.36+(j-1)*.22,-2.6,1.9),.02,rust)
# Continuous rubble connects the ruined blocks into one street, with leaning beams across empty plots.
for i in range(170):
 x=rng.uniform(-66,66);y=rng.uniform(-5,-2);size=rng.uniform(.25,.9)
 if i%5==0:cube('fractured_mid_slab',(x,y,.22),(size*2,size,.16),rng.choice(concrete),.03,rotation=(.15,rng.uniform(-.3,.4),rng.random()*6))
 else:shard('continuous_mid_rubble',(x,y,size*.35),(size,size*.65,size*.55),rng.choice(concrete+[brick]))
for x in [-44,-26,9,29,46]:
 cube('fallen_pillar',(x,-2.8,1.1),(.45,.5,3.7),concrete[2],.04,rotation=(0,rng.choice([-.8,.75]),.05))
 rod('fallen_pillar_rebar',(x,-2.7,1.5),(x+.85,-2.7,2.4),.021,rust)
for c in collections.values():c.hide_render=False
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'m7_city_layers.blend'))
for key,c in collections.items():
 for other in collections.values():other.hide_render=other!=c
 scene.render.filepath=str(OUT/(key+'.png'));bpy.ops.render.render(write_still=True);print('REFINED M7 LAYER',key,flush=True)
