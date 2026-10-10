"""Human-approved simple DIY spring piston visual; no manufacturing output. Author sergio.pulido@alodai.com."""
import bpy,math
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene;scene.unit_settings.scale_length=.001
root=bpy.data.objects.new('module_piston_jump',None);scene.collection.objects.link(root);root.scale=(.01,)*3;root['author']='sergio.pulido@alodai.com';root['concept']='Sergio-approved spring piston visual; generic DIY actuator, not a verified purchasable SKU or printable design.'
def material(name,c,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes['Principled BSDF'];s.inputs['Base Color'].default_value=(*c,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=.6;return m
orange=material('petg',(1,.1946,.0103));steel=material('steel',(.4,.43,.47),.75);black=material('rubber_and_chip',(.012,.015,.018))
def cyl(name,p,r,h,mat,parent=root,n=24):
 bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=h,location=p);o=bpy.context.object;o.name=name;o.parent=parent;o.data.materials.append(mat);return o

def box(name,p,size,mat,parent=root):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.parent=parent;o.data.materials.append(mat);return o
# 18 mm cylinder on the free front underside, shared rover-ground origin and 100 mm per render unit.
box('piston_mount_plate',(80,0,29),(32,22,3),orange);cyl('piston_cylinder',(90,0,34),9,10,steel);cyl('piston_lower_guide',(90,0,29.5),9.5,1,steel)
foot=bpy.data.objects.new('jump_piston_foot',None);scene.collection.objects.link(foot);foot.parent=root;foot.location=(90,0,22.5)
box('piston_foot_plate',(0,0,0),(32,22,3),black,foot);cyl('piston_rod',(0,0,5.5),2,14,steel,foot,n=16)
# Visible, closed helical return spring around the rod; no inferred functional energy claims.
v=[];segments=60;sides=6
for i in range(segments+1):
 t=i/segments;a=t*math.tau*3;centre=Vector((90+6.5*math.cos(a),6.5*math.sin(a),24.5+t*4));radial=Vector((math.cos(a),math.sin(a),0));vertical=Vector((0,0,1))
 for j in range(sides):q=centre+.4*(math.cos(j*math.tau/sides)*radial+math.sin(j*math.tau/sides)*vertical);v.append(tuple(q))
f=[tuple(reversed(range(sides))),tuple(range(segments*sides,(segments+1)*sides))]
for i in range(segments):
 for j in range(sides):k=(j+1)%sides;f.append((i*sides+j,i*sides+k,(i+1)*sides+k,(i+1)*sides+j))
d=bpy.data.meshes.new('return_spring');d.from_pydata(v,[],f);d.update();o=bpy.data.objects.new('return_spring',d);scene.collection.objects.link(o);o.parent=root;d.materials.append(steel)
# Merge only static meshes by material, retaining the moving foot/rod node.
groups={}
for o in root.children_recursive:
 if o.type=='MESH':groups.setdefault((o.parent,o.data.materials[0]),[]).append(o)
for (parent,mat),objects in groups.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 bpy.context.object.name=('foot_' if parent==foot else 'piston_')+mat.name
# Bake mm into render units, so game foot travel (0.3 units) is not reduced by a root scale.
for o in root.children_recursive:
 o.location*=.01
 if o.type=='MESH':
  for vertex in o.data.vertices:vertex.co*=.01
root.scale=(1,1,1);scene.unit_settings.scale_length=1
root['pose']='Retracted foot above ground with tracks deckOffsetY=-0.205; bracket overlaps front chassis lip.'
scene['author']='sergio.pulido@alodai.com';bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'module_piston_jump.blend'));bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath='/tmp/piston_jump_plain.glb',export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
