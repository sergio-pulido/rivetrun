"""Human-requested 68 mm EDF visual concept, not a sourced purchasable SKU. Author sergio.pulido@alodai.com."""
import bpy,bmesh,math,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene;scene.unit_settings.scale_length=.001
root=bpy.data.objects.new('module_ducted_fan',None);scene.collection.objects.link(root);root.scale=(.01,)*3;root['author']='sergio.pulido@alodai.com';root['concept']='Generic 68 mm electric ducted fan requested by human; no purchasable SKU or physical fit claim.'
def mat(name,c,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes['Principled BSDF'];s.inputs['Base Color'].default_value=(*c,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=.68;return m
black=mat('rubber_and_chip',(.012,.015,.018));metal=mat('steel',(.4,.43,.47),.75);orange=mat('petg',(1,.1946,.0103))
def mesh(name,verts,faces,material,parent=root):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();bm=bmesh.new();bm.from_mesh(d);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(d);bm.free();o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.parent=parent;d.materials.append(material);return o
# X-forward duct, rear-deck placement; every coordinate is in the rover's shared native-mm frame.
cx=-92;cz=124;n=64;vertices=[]
for x,r in [(cx-21,34),(cx+21,34),(cx-21,32),(cx+21,32)]:
 for i in range(n):a=i*math.tau/n;vertices.append((x,r*math.sin(a),cz+r*math.cos(a)))
faces=[]
for i in range(n):
 j=(i+1)%n
 faces.extend([(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)])
mesh('edf_closed_annular_duct',vertices,faces,black)
rotor=bpy.data.objects.new('thruster_rotor_ducted_fan',None);scene.collection.objects.link(rotor);rotor.parent=root;rotor.location=(cx,0,cz)
for blade in range(9):
 a=blade*math.tau/9;outline=[(7,a-.14),(29,a-.04),(30,a+.15),(22,a+.28),(10,a+.30)];v=[]
 for sign in [-1,1]:
  for r,t in outline:v.append((sign*.7+(r-7)*.08,r*math.sin(t),r*math.cos(t)))
 count=len(outline);f=[tuple(reversed(range(count))),tuple(range(count,2*count))]+[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)];mesh('edf_rotor_blade_'+str(blade),v,f,metal,rotor)
def cyl(name,p,r,length,material,parent=root):
 v=[(x,r*math.sin(i*math.tau/24),r*math.cos(i*math.tau/24)) for x in [-length/2,length/2] for i in range(24)];f=[tuple(reversed(range(24))),tuple(range(24,48))]+[(i,(i+1)%24,(i+1)%24+24,i+24) for i in range(24)];o=mesh(name,v,f,material,parent);o.location=p;return o
cyl('edf_motor_hub',(0,0,0),8,18,black,rotor);cyl('edf_hub_cap',(10,0,0),7,2,metal,rotor)
def box(name,p,s,material):
 w,d,h=s;v=[(p[0]+x*w/2,p[1]+y*d/2,p[2]+z*h/2) for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]];return mesh(name,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],material)
for y in [-27,27]:box('edf_mount_upright_'+('left' if y<0 else 'right'),(cx,y,71),(8,5,66),orange);box('edf_mount_foot_'+('left' if y<0 else 'right'),(cx+6,y,42),(48,10,4),orange)
# Three rear stator vanes hold the motor, distinct from the animated rotor.
for a in [0,math.tau/3,2*math.tau/3]:
 p=(cx-14,20*math.sin(a),cz+20*math.cos(a));o=box('edf_stator_vane',p,(3,3,26),black);
 for v in o.data.vertices:v.co-=Vector(p)
 o.location=p;o.rotation_euler.x=-a
groups={}
for o in root.children_recursive:
 if o.type=='MESH':groups.setdefault((o.parent,o.data.materials[0]),[]).append(o)
for (parent,material),objects in groups.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 bpy.context.object.name=('rotor_' if parent==rotor else 'edf_')+material.name
scene['author']='sergio.pulido@alodai.com';bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'module_ducted_fan.blend'));bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath='/tmp/ducted_fan_plain.glb',export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_animations=False)
