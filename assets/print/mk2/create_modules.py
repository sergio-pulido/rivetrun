"""Buildable MK-II v2 module authoring. Author: sergio.pulido@alodai.com.

No component is created unless it occurs in the supplied component reference.
Missing dimensions/interfaces are recorded, not invented. This provisional
generator is updated against bom-mk2.json once that file is available.
"""
import bpy
import json
import math
import re
import sys
from pathlib import Path
from mathutils import Vector

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
OUT=ROOT/'apps/web/public/models/mk2'
OUT.mkdir(parents=True,exist_ok=True)
AUTHOR='sergio.pulido@alodai.com'
reference=ROOT/'docs/inputs/real-parts.json'
records={p['id']:p for p in json.loads(reference.read_text())}
bom_path=ROOT/'docs/inputs/bom-mk2.json'
bom=json.loads(bom_path.read_text())
bom_items={p['key']:p for p in bom['items']}
geometry=json.loads((HERE/'print-geometry.json').read_text())
printed_ids={p['id'] for p in geometry['parts']}
DEFAULT=['chassis','wheels','motor_torque','battery_large']
SCALE=.01 # 100 physical mm = one render unit. Common authoring frame is mm.

bpy.ops.wm.open_mainfile(filepath=str(HERE/'mk2-print-source.blend'))
templates={id:bpy.data.objects['print_'+id].data.copy() for id in printed_ids}
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj,do_unlink=True)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=.001

def material(name,color,metal=0,rough=.6):
    m=bpy.data.materials.new(name)
    m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=rough
    return m

petg=material('petg',(.08,.13,.16),rough=.7)
black=material('rubber_and_chip',(.012,.014,.017),rough=.8)
steel=material('steel',(.5,.55,.6),.85,.35)
brass=material('brass',(.54,.35,.085),.8,.35)
pcb=material('pcb',(.012,.18,.07),rough=.5)
polymer=material('polymer',(.6,.62,.65),rough=.6)
root=None
modules={}

def empty(name,p=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None)
    scene.collection.objects.link(o)
    o.location=p
    o.parent=parent
    return o

def module(id,slot):
    global root
    root=empty('module_'+id)
    root.scale=(SCALE,)*3
    root['partId']=id
    root['slot']=slot
    root['author']=AUTHOR
    root['reference']=str(reference.relative_to(ROOT))
    modules[id]=root
    return root

def parent_mesh(o,name,mat,parent=None):
    o.name=name
    o.parent=parent or root
    o.data.materials.append(mat)
    return o

def block(name,p,size,mat,parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p)
    o=bpy.context.object
    o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return parent_mesh(o,name,mat,parent)

def cylinder(name,p,r,depth,mat,axis='Z',parent=None,vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=p)
    o=bpy.context.object
    if axis=='Y':o.rotation_euler.x=math.pi/2
    if axis=='X':o.rotation_euler.y=math.pi/2
    for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
    return parent_mesh(o,name,mat,parent)

def print_instance(id,p,index=None,parent=None):
    assert id in printed_ids,id
    name='print_'+id+(f'__{index}' if index else '')
    o=bpy.data.objects.new(name,templates[id].copy())
    scene.collection.objects.link(o)
    o.parent=parent or root
    o.location=p
    o.data.materials.clear()
    o.data.materials.append(petg)
    o['printedPartId']=id
    o['author']=AUTHOR
    # Exact planar dissolution only: manufacture geometry is unchanged in STL.
    bpy.context.view_layer.objects.active=o
    mod=o.modifiers.new('Visual coplanar reduction','DECIMATE')
    mod.decimate_type='DISSOLVE'
    mod.angle_limit=.001
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if id=='chassis_base':
        mod=o.modifiers.new('Visual budget reduction','DECIMATE')
        mod.ratio=.70
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

module('chassis','fixed')
print_instance('chassis_base',(0,0,27))

for id,radius in [('wheels',40)]:
    module(id,'locomotion')
    spec=bom_items['wheels_80x10']['specs']
    spec={**spec,'shaftDiameterMm':3}
    assert spec['diameterMm']==radius*2
    for i,(ax,x,side,y) in enumerate([('front',65,'left',-36),('front',65,'right',36),('rear',-65,'left',-36),('rear',-65,'right',36)],1):
        # Rigid printed clamps, not fictional suspension. Motors are carried by
        # the existing catalog motor module; mounts travel with locomotion.
        print_instance('motor_saddle',(x,y,radius-9),i)
        print_instance('motor_cap',(x,y,radius+6),i)
        sign=-1 if y<0 else 1
        pivot=empty('wheel_'+ax+'_'+side,(x,sign*55,radius),root)
        wheel=cylinder('tire_mesh_'+ax+'_'+side,(0,0,0),radius,spec['widthMm'],black,'Y',pivot,48)
        # Shaft opening is the supplied nominal 3 mm, not a fabricated hub.
        bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=spec['shaftDiameterMm']/2,depth=spec['widthMm']+2,location=(0,0,0),rotation=(math.pi/2,0,0))
        cutter=bpy.context.object
        cutter.parent=pivot
        bpy.context.view_layer.objects.active=wheel
        mod=wheel.modifiers.new('Shaft opening','BOOLEAN')
        mod.operation='DIFFERENCE'
        mod.object=cutter
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter,do_unlink=True)

for id in ('motor_light','motor_torque'):
    module(id,'motor')
    width,height,length=records[id]['specs']['bodyDimensionsMm']
    for i,(x,y) in enumerate([(65,-36),(65,36),(-65,-36),(-65,36)],1):
        block('motor_can_'+str(i),(x,y,40),(width,length,height),steel)

for id in ('battery_small','battery_large'):
    module(id,'battery')
    spec=bom_items['battery_2s_'+('small' if id=='battery_small' else 'large')]['specs']
    dims=[float(v) for v in spec['dimsMm'].split('×')]
    print_instance('battery_tray',(0,0,31))
    block('lipo_cell',(0,0,33.5+dims[2]/2),dims,polymer)

module('ultrasonic','sensor')
# The full external envelope is 45x20x15 mm. Details are a visual envelope,
# not a new purchased component or a manufacturing dimension claim.
dimensions=[float(v) for v in bom_items['ultrasonic_hc_sr04']['specs']['dimensionsMm'].split(' x ')]
block('ultrasonic_pcb',(76,0,40),(1.6,dimensions[0],dimensions[1]),pcb)
for y in (-12,12):
    cylinder('ultrasonic_transducer_'+str(y).replace('-','neg'),(83,y,40),7,13,steel,'X')

module('camera','sensor')
spec=records['camera']['specs']
block('camera_pcb',(61,0,57),(1.6,spec['widthMm'],spec['heightMm']),pcb)
cylinder('camera_lens',(66.75,0,57),5.5,9.9,black,'X')

# Components with unknown mechanical dimensions or unspecified assemblies are
# deliberately absent. Completing these depends on the incoming definitive BOM.
deferred=['offroad_wheels','controller','tracks','imu','moisture_probe','scout_drone','winch','waterproof_case','bumper','thruster_kit','piston_jump']

def count_tri(objects):
    n=0
    for o in objects:
        if o.type=='MESH':
            o.data.calc_loop_triangles()
            n+=len(o.data.loop_triangles)
    return n

def compact(root):
    # Preserve print_* nodes and all pivots. Only combine the non-printed
    # direct children by material; a printed node never loses its identity.
    groups={}
    for o in list(root.children_recursive):
        if o.type=='MESH' and not o.name.startswith('print_'):
            groups.setdefault((o.parent,o.data.materials[0]),[]).append(o)
    for (parent,mat),objects in groups.items():
        if len(objects)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        bpy.context.object.name=parent.name+'__'+mat.name

def export(id):
    r=modules[id]
    compact(r)
    objects=[r,*r.children_recursive]
    for o in objects:
        o.name=re.sub(r'\.(\d+)$',r'__\1',o.name)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=r
    path=OUT/(id+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False,export_original_specular=False)
    tri=count_tri(objects)
    meshes=sum(o.type=='MESH' for o in objects)
    if r['slot']=='locomotion':assert tri<=8000,(id,tri)
    else:assert tri<=2500 and meshes<=6,(id,tri,meshes)
    assert path.stat().st_size<=400_000,(id,path.stat().st_size)
    prints=sorted({o.get('printedPartId') for o in objects if o.get('printedPartId')})
    return {'file':id+'.glb','slot':r['slot'],'triangles':tri,'meshes':meshes,'bytes':path.stat().st_size,'printedParts':prints}

manifest={'version':2,'author':AUTHOR,'status':'partial_missing_mechanical_dimensions','reference':[str(reference.relative_to(ROOT)),str(bom_path.relative_to(ROOT))],'fixed':['chassis','controller'],'modules':{},'deckOffsetY':{'wheels':0,'offroad_wheels':.05,'tracks':0},'deferred':deferred,'scaleMmPerRenderUnit':100,'contractPath':'docs/MK2_ASSET_CONTRACT.md','pathOverride':'apps/web/public/models/mk2/ requested by human; contract currently names the v1 folder','manufacturingStatus':'Provisional. No physical fit test. Motor envelopes still use real-parts.json; electronic modules require printed mounts. Controller, insert pilot and wiring interfaces lack BOM dimensions. Not a validated complete build.'}
for id in modules:manifest['modules'][id]=export(id)
assert sum(p['bytes'] for p in manifest['modules'].values())<=3_000_000
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Save a compact partial assembly. Unknown parts and unsupported decorations
# are never substituted with invented meshes. Assembly mounts are added only
# after dimensional source data for them is available.
for id,r in modules.items():
    for o in [r,*r.children_recursive]:
        o.hide_render=id not in DEFAULT
        o.hide_set(id not in DEFAULT)
    # Preview uses the same common frame as exported modules.
scene['author']=AUTHOR
scene['status']='Partial until definitive BOM. No face. Purchased envelopes use supplied dimensions.'
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'mk2-rover-source.blend'))
print('MODULES READY: '+json.dumps(manifest))
